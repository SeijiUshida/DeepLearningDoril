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
/*
 * ===== 自動読み込み（推奨） =====
 * data/ フォルダに「同じ形式のCSV」を追加してGitHubにpushするだけで、
 * アプリが起動時にフォルダの中身を毎回問い合わせて自動的に取り込みます。
 * つまり、他の人が新しい章のCSVを作って push すれば、
 * config.js を一切編集しなくても単語帳が増えます。
 *
 * 使い方：自分のGitHubユーザー名とリポジトリ名を入れるだけ（最初の1回のみ）。
 *   owner  : リポジトリの所有者（ユーザー名 or Organization名）
 *   repo   : リポジトリ名
 *   branch : 公開に使っているブランチ（通常 "main"）
 *   dir    : CSVを置いているフォルダ（このテンプレートでは "data"）
 */
const AUTO_DISCOVER_SHEETS = {
  enabled: true,
  owner: "your-github-username",
  repo: "your-repo-name",
  branch: "main",
  dir: "data",
};

/*
 * ===== 手動登録（任意） =====
 * リポジトリ内のCSVではなく、Googleスプレッドシートを「ウェブに公開」したURLなど、
 * data/ フォルダの外にある単語帳を追加したい場合はここに書きます。
 * AUTO_DISCOVER_SHEETS と併用でき、両方が読み込まれます（不要なら空配列でOK）。
 */
const SHEET_CONFIG = [
  // { label: "外部スプレッドシート", url: "https://docs.google.com/spreadsheets/d/e/xxxxx/pub?output=csv" },
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
