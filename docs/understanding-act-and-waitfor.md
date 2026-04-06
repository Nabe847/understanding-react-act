# React Testing Library の `act` エラーと `waitFor` の動作を理解する

> このドキュメントは AI（Claude）を使用して作成されています。

## `act` とは何か

`act` は React が提供するテストユーティリティで、中で発生するすべての状態更新・エフェクトが完了するまで待ってからコントロールを返す。

```tsx
act(() => {
  button.click();
});
// ここでは DOM が更新済み
expect(screen.getByText('clicked')).toBeInTheDocument();
```

RTL の `render` や `fireEvent` は内部で `act` を呼んでいるため、通常は自分で書く必要はない。

## `IS_REACT_ACT_ENVIRONMENT` — 警告の発生条件

React は `act` 警告を出すかどうかの判定に、グローバル変数 `IS_REACT_ACT_ENVIRONMENT` を参照する（React 18 で導入）。

```ts
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
```

この値が `true` の環境で `act` スコープ外の `setState` が呼ばれると `console.error` が出る。RTL を使っている場合はこのフラグが自動的に `true` に設定される。

**警告は `setState` を呼んだタイミングで発生する。** 状態更新が実際にDOMへ反映されるタイミングではない。

## `async act` の限界

`async act` はコールバックが返す Promise を await し、その解決に伴う状態更新もDOMへ反映する。ただし **追跡できるのはコールバックの Promise チェーンに直接繋がっている非同期処理のみ**。

```tsx
await act(async () => {
  window.dispatchEvent(new Event('focus'));
  // SWR が fetch を開始するが、
  // その Promise はこのコールバックの戻り値と繋がっていない
  // → act は待てず終了 → fetch 完了後の setState で警告
});
```

コンポーネント内部で間接的に発火する非同期処理に対しては `async act` だけでは不十分であり、自分で `act` を書く場面はあまりない。

## `waitFor` の実装

`waitFor` は [dom-testing-library の `wait-for.js`](https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for.js) に実装されている。

### 再実行のトリガー

```js
intervalId = setInterval(checkRealTimersCallback, interval)

const {MutationObserver} = getWindowFromNode(container)
observer = new MutationObserver(checkRealTimersCallback)
observer.observe(container, mutationObserverOptions)
```

1. **`setInterval`** — デフォルト50ms間隔のポーリング
2. **`MutationObserver`** — DOM の変更を検知して即座にリトライ

### コールバック実行の流れ

```js
function checkCallback() {
  if (promiseStatus === 'pending') return
  try {
    const result = runWithExpensiveErrorDiagnosticsDisabled(callback)
    if (typeof result?.then === 'function') {
      promiseStatus = 'pending'
      result.then(
        resolvedValue => {
          promiseStatus = 'resolved'
          onDone(null, resolvedValue)
        },
        rejectedValue => {
          promiseStatus = 'rejected'
          lastError = rejectedValue
        },
      )
    } else {
      onDone(null, result)
    }
  } catch (error) {
    lastError = error
  }
}
```

コールバックが例外なく完了すれば resolve。例外が出たら `lastError` に保存し、次のトリガーでリトライ。タイムアウト（デフォルト1000ms）で `lastError` を使って reject。

## RTL の `asyncWrapper` — act 警告を回避する仕組み

RTL は `waitFor` を `asyncWrapper` 経由で実行する。実装は [react-testing-library の `pure.js`](https://github.com/testing-library/react-testing-library/blob/main/src/pure.js) にある。

```js
asyncWrapper: async cb => {
  const previousActEnvironment = getIsReactActEnvironment()
  setReactActEnvironment(false)
  try {
    const result = await cb()
    await new Promise(resolve => {
      setTimeout(() => {
        resolve()
      }, 0)
      if (jestFakeTimersAreEnabled()) {
        jest.advanceTimersByTime(0)
      }
    })
    return result
  } finally {
    setReactActEnvironment(previousActEnvironment)
  }
},
```

流れ:

1. `setReactActEnvironment(false)` で `IS_REACT_ACT_ENVIRONMENT` を `false` にする
2. `waitFor` 本体がリトライを開始
3. **この間に発生する `setState` は `IS_REACT_ACT_ENVIRONMENT` が `false` なので警告が出ない**
4. コールバック成功またはタイムアウトで Promise が settle
5. `finally` で `IS_REACT_ACT_ENVIRONMENT` を `true` に戻す

**RTL の `waitFor` は `act` で各リトライを包んでいるのではなく、`IS_REACT_ACT_ENVIRONMENT` 自体を一時的に `false` にすることで警告を無効化している。**

`waitFor` は「まだ非同期処理が完了していない状態を繰り返しチェックする」という性質上、リトライ中に `act` 外の `setState` が起きるのは想定内だ。コールバックが成功するまでリトライし続けるので、DOM が古い状態でもリトライで吸収できる。だから `act` で包む必要がない。

## それでも act 警告が出るケース

`waitFor` の Promise が resolve して `IS_REACT_ACT_ENVIRONMENT` が `true` に戻った**後**に、未完了の非同期処理が `setState` を呼ぶ場合は警告が出る。

典型例:

- SWR のバックグラウンド revalidation がテスト終了直前に `setState` を呼ぶ
- `render` 直後に `waitFor` / `findBy` を使わずにアサーションしている
- `afterEach` のクリーンアップ中に非同期処理が完了する

対処の基本は、テスト中に不要な revalidation を `SWRConfig` で無効化すること。

```tsx
<SWRConfig
  value={{
    provider: () => new Map(),
    dedupingInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  }}
>
  {children}
</SWRConfig>
```

## 参照

- [React 公式ドキュメント — act](https://react.dev/reference/react/act)
- [dom-testing-library/src/wait-for.js](https://github.com/testing-library/dom-testing-library/blob/main/src/wait-for.js)
- [react-testing-library/src/pure.js](https://github.com/testing-library/react-testing-library/blob/main/src/pure.js)
- [Testing Library 公式ドキュメント — Async Methods](https://testing-library.com/docs/dom-testing-library/api-async/)