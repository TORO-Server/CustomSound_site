# カスタムサウンド 配布所

TORO Server のカスタムサウンド一覧ページ (https://sound.torosaba.net/)。
GitHub Pages が `main` ブランチをそのまま配信している (ビルドはしない)。

## ファイル

| パス | 内容 |
| --- | --- |
| `index.html` | ページ本体 (サウンド一覧は中の `voiceData` に書く) |
| `audio/` | サウンド (.ogg) |
| `assets/styles.css` | **生成物**: Tailwind をビルドした CSS + スマホ向けの追加分 |
| `sw.js` | **生成物**: Service Worker |
| `src/styles.css` | `assets/styles.css` の元。スマホ表示の調整もここ |
| `src/sw.ts` | `sw.js` の元 (TypeScript) |
| `manifest.webmanifest` | PWA のマニフェスト |
| `offline.html` | オフラインで開けなかったときのページ |
| `icons/` | アプリアイコン (192/512, maskable 512, apple-touch-icon 180, favicon) とヘッダー画像 |
| `vendor/fontawesome/` | Font Awesome Free 6.7.2 (solid のみ)。オフラインでもアイコンが出るように同梱 |

## PWA の動き

- シェル (ページ, CSS, アイコン, フォント, マニフェスト) と `offline.html` は最初に保存される。
- ページを開くときはネットワーク優先。つながらなければ保存したページ → `offline.html` の順で出す。
- サウンドは **再生したものだけ** 保存され (最大 60 件、古いものから消える)、次からはオフラインでも鳴る。
  `audio/` 全部を最初に落とすことはしない。
- 再生・シーク時の Range リクエストには、保存した全体から 206 を組み立てて返す。
- 別オリジン (Google Fonts など) は保存しない。

## ビルド

`sw.js` と `assets/styles.css` は生成物だが、GitHub Pages はビルドしないのでコミットする。

```sh
npm install
npm run build       # assets/styles.css と sw.js を作り直す
npm run typecheck   # src/sw.ts の型チェック
```

- `index.html` で新しい Tailwind のクラスを使ったら `npm run build` し直す (使っているクラスだけが CSS に入る)。
- ページやアイコン、CSS を変えたら、`src/sw.ts` の `VERSION` を上げてからビルドする
  (古いキャッシュが消えて、利用者に新しいものが届く)。
- サウンドを追加するだけなら、`index.html` と `audio/` を変えればよい (ビルド不要)。
  ただし既存の .ogg を同じ名前で差し替えたときは、`src/sw.ts` の `AUDIO_CACHE` の番号を上げてビルドする。

ローカル確認: `npx http-server -p 8094 -c-1` → http://localhost:8094/
