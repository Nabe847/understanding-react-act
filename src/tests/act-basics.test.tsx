import { describe, test, expect, spyOn, beforeEach, afterEach, type Mock } from "bun:test";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

let errorSpy: Mock<typeof console.error>;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("1. actの基本動作", () => {
  test("act内の状態更新はact完了後にDOMへ反映される", () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Counter />);
    });

    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("0");

    act(() => {
      button.click();
    });

    // act完了後、DOMは更新済み
    expect(button.textContent).toBe("1");
  });
});

describe("2. IS_REACT_ACT_ENVIRONMENT と警告", () => {
  test("フラグがtrueのとき、act外のsetStateでconsole.errorが呼ばれる", () => {

    let triggerUpdate: () => void;

    function Component() {
      const [, setState] = useState(0);
      triggerUpdate = () => setState((c) => c + 1);
      return <div />;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Component />);
    });

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    // act外でsetStateを呼ぶ
    triggerUpdate!();

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeDefined();

  });

  test("フラグがfalseのとき、act外のsetStateでact警告は出ない", () => {

    let triggerUpdate: () => void;

    function Component() {
      const [, setState] = useState(0);
      triggerUpdate = () => setState((c) => c + 1);
      return <div />;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Component />);
    });

    globalThis.IS_REACT_ACT_ENVIRONMENT = false;

    triggerUpdate!();

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeUndefined();

  });
});

describe("2a. useEffectとact警告 — useEffect自体ではなく中のsetStateが警告の原因", () => {
  test("act外のrender → useEffect内のsetStateがact外扱いになり警告が出る", async () => {


    function EffectComponent() {
      const [value, setValue] = useState("initial");

      useEffect(() => {
        setValue("updated");
      }, []);

      return <div>{value}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    // act外でrender → useEffect内のsetStateで警告が出るか
    root.render(<EffectComponent />);
    await new Promise((r) => setTimeout(r, 50));

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeDefined();

  });

  test("act内のrender → useEffect内のsetStateもact内で処理され警告は出ない", () => {


    function EffectComponent() {
      const [value, setValue] = useState("initial");

      useEffect(() => {
        setValue("updated");
      }, []);

      return <div>{value}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<EffectComponent />);
    });

    // actがuseEffectもフラッシュするので警告は出ない
    expect(container.textContent).toBe("updated");

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeUndefined();

  });
});

describe("3. async actの限界", () => {
  test("コールバックのPromiseチェーンに繋がっていない非同期処理は追跡できない", async () => {


    let resolveFetch: (value: string) => void;
    const fetchPromise = new Promise<string>((resolve) => {
      resolveFetch = resolve;
    });

    function AsyncComponent() {
      const [data, setData] = useState<string | null>(null);

      useEffect(() => {
        // actのコールバックのPromiseチェーンとは無関係な非同期処理
        fetchPromise.then((value) => {
          setData(value);
        });
      }, []);

      return <div>{data ?? "loading"}</div>;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AsyncComponent />);
    });
    // この時点でuseEffectは実行済みだが、fetchPromiseはまだpending

    expect(container.textContent).toBe("loading");

    // act外でPromiseを解決 → setDataが呼ばれる → act警告
    resolveFetch!("done");
    await fetchPromise;
    // microtaskを消化
    await new Promise((r) => setTimeout(r, 0));

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeDefined();

  });
});
