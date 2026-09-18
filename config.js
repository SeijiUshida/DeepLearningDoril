/*
 * ここに、紐づけたいスプレッドシート（CSV）を n個 並べます。
 *
 * ■ ローカルのCSVファイルを使う場合（このリポジトリの data/ フォルダなど）
 *   url に相対パスを書くだけでOKです。
 *
 * ■ Googleスプレッドシートを使う場合
 *   1. スプレッドシートを開き「ファイル」→「共有」→「ウェブに公開」
 *   2. 公開する範囲でシート（タブ）を選び、形式を「カンマ区切りの値(.csv)」にする
 *   3. 発行されたURLを url に貼り付ける
 *   （1つのシートに複数の章の単語をまとめて書いてもOK。行ごとの chapter 列で判定します）
 *
 * label は章選択画面には使いません（実際の章番号は各CSVの chapter 列から自動集計されます）。
 * ここでの label は読み込みエラー時にどのシートか分かりやすくするための表示名です。
 */
const SHEET_CONFIG = [
  { label: "単語帳シート1", url: "data/chapter1.csv" },
  { label: "単語帳シート2", url: "data/chapter2.csv" },
  { label: "単語帳シート3", url: "data/chapter3.csv" },
];

/*
 * お知らせの取得元。
 * data/announcements.json を編集してGitHubにコミットするだけで、
 * アプリ側のお知らせ（最新・過去分すべて）が更新されます。
 * フォーマット：
 *   [{ "date": "2026-09-18", "title": "見出し", "body": "本文" }, ...]
 * date は新しい順に並んでいなくても自動で並び替えます。
 */
const ANNOUNCEMENTS_URL = "data/announcements.json";

/* 正誤判定後、次の問題に進むまでのディレイ（ミリ秒） */
const FEEDBACK_DELAY_CORRECT = 700;
const FEEDBACK_DELAY_WRONG = 1300;
