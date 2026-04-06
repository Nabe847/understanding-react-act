import { describe, test, expect, spyOn, beforeEach, afterEach, type Mock } from "bun:test";
import React, { useState, useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { SWRConfig, mutate } from "swr";
import useSWR from "swr";

let errorSpy: Mock<typeof console.error>;

beforeEach(() => {
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("4. waitForのリトライ動作", () => {
  test("コールバックが成功するまでリトライし、成功したらresolveする", async () => {
    function DelayedComponent() {
      const [text, setText] = useState("loading");

      useEffect(() => {
        const timer = setTimeout(() => setText("loaded"), 100);
        return () => clearTimeout(timer);
      }, []);

      return <div>{text}</div>;
    }

    render(<DelayedComponent />);

    expect(screen.getByText("loading")).toBeDefined();

    // waitForは「loaded」が表示されるまでリトライする
    await waitFor(() => {
      expect(screen.getByText("loaded")).toBeDefined();
    });
  });
});

describe("5. RTL waitForがact警告を出さないこと", () => {
  test("waitFor中のsetStateでact警告が出ない", async () => {

    let resolveData: (value: string) => void;
    const dataPromise = new Promise<string>((resolve) => {
      resolveData = resolve;
    });

    function FetchComponent() {
      const [data, setData] = useState<string | null>(null);

      useEffect(() => {
        dataPromise.then((value) => setData(value));
      }, []);

      return <div>{data ?? "loading"}</div>;
    }

    render(<FetchComponent />);

    // waitFor開始後にデータを解決
    setTimeout(() => resolveData!("fetched"), 50);

    await waitFor(() => {
      expect(screen.getByText("fetched")).toBeDefined();
    });

    // waitFor中のsetStateでact警告が出ていないことを確認
    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeUndefined();

  });
});

describe("6. waitFor後にact警告が出るケース", () => {
  test("waitFor完了後に発火するsetStateではact警告が出る", async () => {

    let resolveFirst: () => void;
    let resolveSecond: () => void;

    function MultiUpdateComponent() {
      const [first, setFirst] = useState(false);
      const [second, setSecond] = useState(false);

      useEffect(() => {
        new Promise<void>((r) => {
          resolveFirst = r;
        }).then(() => setFirst(true));

        // waitFor完了後に発火する遅延更新
        new Promise<void>((r) => {
          resolveSecond = r;
        }).then(() => setSecond(true));
      }, []);

      return (
        <div>
          <span data-testid="first">{first ? "yes" : "no"}</span>
          <span data-testid="second">{second ? "yes" : "no"}</span>
        </div>
      );
    }

    render(<MultiUpdateComponent />);

    // 最初の更新だけ解決
    setTimeout(() => resolveFirst!(), 50);

    await waitFor(() => {
      expect(screen.getByTestId("first").textContent).toBe("yes");
    });

    // waitFor完了後 = IS_REACT_ACT_ENVIRONMENTがtrueに戻った後にsetState
    resolveSecond!();
    await new Promise((r) => setTimeout(r, 50));

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeDefined();

  });

  test("SWRのrevalidationがwaitFor後にsetStateを呼ぶと警告が出る", async () => {

    let fetchCount = 0;
    const fetcher = () => {
      fetchCount++;
      return new Promise<string>((resolve) => {
        setTimeout(
          () => resolve(`data-${fetchCount}`),
          fetchCount === 1 ? 50 : 100
        );
      });
    };

    function SWRComponent() {
      const { data } = useSWR("swr-revalidation-test", fetcher);
      return <div>{data ?? "loading"}</div>;
    }

    render(
      <SWRConfig
        value={{
          dedupingInterval: 0,
        }}
      >
        <SWRComponent />
      </SWRConfig>
    );

    await waitFor(() => {
      expect(screen.getByText("data-1")).toBeDefined();
    });

    // waitFor完了後にmutateでrevalidationを発火
    // IS_REACT_ACT_ENVIRONMENTはtrueに戻っているので、
    // revalidation完了時のsetStateでact警告が出る
    mutate("swr-revalidation-test");
    await new Promise((r) => setTimeout(r, 200));

    const actWarning = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("act(")
    );
    expect(actWarning).toBeDefined();

  });
});
