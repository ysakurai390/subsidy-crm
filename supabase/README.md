# Supabase setup for HUV

このフォルダには、HUVの自賠責保険閲覧サイト用の最小構成SQLを置いています。

## 作るもの

- `facilities`
  - 施設情報
- `vehicles`
  - 施設に紐づく車両情報
- `insurance-pdfs`
  - 自賠責保険PDFを保存するStorage bucket

## 手順

1. Supabaseで新規プロジェクトを作成
2. Dashboardの `SQL Editor` を開く
3. [01_schema.sql](/Users/yutasakurai/Documents/New%20project/supabase/01_schema.sql) を実行
4. [02_storage.sql](/Users/yutasakurai/Documents/New%20project/supabase/02_storage.sql) を実行
5. Dashboardの `Authentication > Providers` で `Email` を有効化
6. `Authentication > Users` から管理者ユーザーを1件作成
7. `Project Settings > API` で `Project URL` と `anon/public key` を控える

## 今回の権限設計

- 閲覧ページ
  - `anon` でも `facilities` と `vehicles` は読める
  - `anon` でも自賠責保険PDFを見られる
- 管理ページ
  - `authenticated` ユーザーのみ追加・更新・削除できる
- PDF
  - `insurance-pdfs` bucket は公開
  - 閲覧側はログインなしでPDFを見られる
  - アップロード・更新・削除は `authenticated` のみ

## 補足

この構成では、PDFのURLを知っていれば誰でも閲覧できます。
機密性が高い書類には向きませんが、今回の「閲覧側がログインなしでPDFまで見たい」という要件には合っています。
