# understand-react-act

React Testing Library の `act` エラーと `waitFor` の動作を、テストコードで確認するプロジェクト。

## 検証項目

| # | 主張 | テストファイル |
|---|---|---|
| 1 | `act` 内の状態更新は完了後にDOMへ反映される | act-basics.test.tsx |
| 2 | `IS_REACT_ACT_ENVIRONMENT=true` + act外setState → エラーが出る | act-basics.test.tsx |
| 2a | useEffect自体ではなく中のsetStateがエラーの原因 | act-basics.test.tsx |
| 3 | `async act` はPromiseチェーン外の非同期処理を追跡できない | act-basics.test.tsx |
| 4 | `waitFor` は成功するまでリトライする | waitfor-behavior.test.tsx |
| 5 | RTL の `waitFor` 中は `IS_REACT_ACT_ENVIRONMENT` が `false` になりエラーが出ない | waitfor-behavior.test.tsx |
| 6 | `waitFor` 完了後の setState ではエラーが出る | waitfor-behavior.test.tsx |

詳細な解説は [docs/understanding-act-and-waitfor.md](docs/understanding-act-and-waitfor.md) を参照。

## セットアップ

```bash
bun install
```

## テスト実行

```bash
bun test
```
