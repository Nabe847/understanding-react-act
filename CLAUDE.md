# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

React Testing Library の `act` エラーと `waitFor` の内部実装をテストコードで再現・検証するプロジェクト。

## Commands

```bash
bun test                              # 全テスト実行
bun test src/tests/act-basics.test.tsx # 単一ファイル実行
bun run typecheck                     # 型チェック
```

## Structure

- `docs/understanding-act-and-waitfor.md` — 検証対象の技術記事
- `src/tests/act-basics.test.tsx` — actの基本動作、IS_REACT_ACT_ENVIRONMENT、async actの限界
- `src/tests/waitfor-behavior.test.tsx` — waitForのリトライ、asyncWrapperによるエラー無効化、waitFor後のエラー
- `src/global.d.ts` — `IS_REACT_ACT_ENVIRONMENT` のグローバル型定義
- `bunfig.toml` — テスト時に `src/tests/setup.ts`（happy-dom登録）をpreload

## Testing conventions

- `console.error` の spy は各ファイルのトップレベル `beforeEach`/`afterEach` で管理
- actエラーの検出は `errorSpy.mock.calls` から `"act("` を含む呼び出しを検索
