"use client";

import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type ScoreRow = {
  score: number | null;
};

type RawTeamRow = {
  id: number;
  name: string;
  scores: ScoreRow[] | null;
};

type TeamRow = {
  id: number;
  name: string;
  totalScore: number;
};

type HistoryRow = {
  id: number;
  game_name: string;
  team_name: string;
  score: number;
  created_at: string;
};

type HistoryRowWithTeam = {
  id: number;
  game_name: string;
  score: number;
  created_at: string;
  teams: { name: string } | null;
};

export default function Home() {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string>("モルック");
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [teamAScore, setTeamAScore] = useState<string>("");
  const [teamBScore, setTeamBScore] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "history">("summary");
  const [historyRows, setHistoryRows] = useState<HistoryRow[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!hasEnvVars) return;

    const supabase = createClient();

    supabase
      .from("teams")
      .select("id, name, scores(score)")
      .order("id", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setError(error.message);
          return;
        }

        const aggregated: TeamRow[] = (data as RawTeamRow[] | null | undefined)?.map(
          (row) => ({
            id: row.id,
            name: row.name,
            totalScore: Array.isArray(row.scores)
              ? row.scores.reduce(
                  (sum, s) => sum + (s?.score ?? 0),
                  0,
                )
              : 0,
          }),
        ) ?? [];

        setRows(aggregated);
      });
  }, []);

  useEffect(() => {
    if (!hasEnvVars || activeTab !== "history") return;

    const supabase = createClient();
    setIsLoadingHistory(true);

    supabase
      .from("scores")
      .select("id, game_name, score, created_at, teams(name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setError(error.message);
          setIsLoadingHistory(false);
          return;
        }
        const mapped: HistoryRow[] =
          ((data ?? []) as unknown as HistoryRowWithTeam[])?.map((row) => ({
            id: row.id,
            game_name: row.game_name,
            score: row.score,
            created_at: row.created_at,
            team_name: row.teams?.name ?? "",
          })) ?? [];

        setHistoryRows(mapped);
        setIsLoadingHistory(false);
      });
  }, [activeTab]);

  const teamA = rows?.find((t) => t.id === teamAId) ?? null;
  const teamB = rows?.find((t) => t.id === teamBId) ?? null;

  const aScoreNum = Number(teamAScore) || 0;
  const bScoreNum = Number(teamBScore) || 0;
  const diff = Math.abs(aScoreNum - bScoreNum);

  const winner = aScoreNum === bScoreNum ? null : aScoreNum > bScoreNum ? "A" : "B";
  const loser = winner === "A" ? "B" : winner === "B" ? "A" : null;

  // liaos の計算結果（DB に保存する「Score」として扱う）
  const winnerValue =
    winner === "A" || winner === "B" ? 3000 + diff * 100 : 0;
  const loserValue =
    loser === "A" || loser === "B" ? -3000 - diff * 100 : 0;

  const handleSaveMolkky = async () => {
    if (!teamA || !teamB) return;

    setIsSaving(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      const { error } = await supabase.from("scores").insert([
        {
          game_name: "モルック",
          team_id: teamA.id,
          score: winner === "A" ? winnerValue : loserValue,
        },
        {
          game_name: "モルック",
          team_id: teamB.id,
          score: winner === "B" ? winnerValue : loserValue,
        },
      ]);

      if (error) {
        console.error(error);
        setSaveError(error.message);
        return;
      }

      // 再読み込みして合計スコアを更新
      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("id, name, scores(score)")
        .order("id", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSaveError(fetchError.message);
        return;
      }

      const aggregated: TeamRow[] = (data as RawTeamRow[] | null | undefined)?.map(
        (row) => ({
          id: row.id,
          name: row.name,
          totalScore: Array.isArray(row.scores)
            ? row.scores.reduce(
                (sum, s) => sum + (s?.score ?? 0),
                0,
              )
            : 0,
        }),
      ) ?? [];

      setRows(aggregated);
      setIsDialogOpen(false);
      setTeamAId(null);
      setTeamBId(null);
      setTeamAScore("");
      setTeamBScore("");

      // 履歴タブを見ている場合は最新データを再取得
      if (activeTab === "history") {
        const { data: hData, error: hError } = await supabase
          .from("scores")
          .select("id, game_name, score, created_at, teams(name)")
          .order("created_at", { ascending: false });

        if (!hError) {
          const mapped: HistoryRow[] =
            ((hData ?? []) as unknown as HistoryRowWithTeam[])?.map((row) => ({
              id: row.id,
              game_name: row.game_name,
              score: row.score,
              created_at: row.created_at,
              team_name: row.teams?.name ?? "",
            })) ?? [];

          setHistoryRows(mapped);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHistory = async (id: number) => {
    if (!window.confirm("この記録を削除しますか？")) return;

    const supabase = createClient();

    const { error: deleteError } = await supabase.from("scores").delete().eq("id", id);
    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
      return;
    }

    setHistoryRows((prev) => prev?.filter((row) => row.id !== id) ?? null);

    // 合計スコアも更新
    const { data, error: fetchError } = await supabase
      .from("teams")
      .select("id, name, scores(score)")
      .order("id", { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      setError(fetchError.message);
      return;
    }

    const aggregated: TeamRow[] = (data as RawTeamRow[] | null | undefined)?.map(
      (row) => ({
        id: row.id,
        name: row.name,
        totalScore: Array.isArray(row.scores)
          ? row.scores.reduce(
              (sum, s) => sum + (s?.score ?? 0),
              0,
            )
          : 0,
      }),
    ) ?? [];

    setRows(aggregated);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-4">
        {!hasEnvVars && (
          <p className="text-sm text-red-500">
            Supabase の環境変数が設定されていないため、DB に接続できません。
          </p>
        )}

        {hasEnvVars && !rows && !error && (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        )}
        {error && (
          <p className="text-sm text-red-500">エラー: {error}</p>
        )}
        {hasEnvVars && (
          <div className="flex gap-2 border-b pb-2 mb-4 text-sm">
            <button
              type="button"
              className={`px-3 py-1 rounded-md border ${
                activeTab === "summary"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background text-foreground border-border"
              }`}
              onClick={() => setActiveTab("summary")}
            >
              サマリ
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-md border ${
                activeTab === "history"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background text-foreground border-border"
              }`}
              onClick={() => setActiveTab("history")}
            >
              履歴
            </button>
          </div>
        )}

        {hasEnvVars && activeTab === "summary" && rows && (
          <div className="space-y-4">
            <div className="overflow-x-auto border rounded-lg bg-background/60">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3">Team</th>
                    <th className="py-2 px-3">Total Liaos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-3 px-3 text-muted-foreground">
                        テーブル &quot;teams&quot; にデータがありません。
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.name} className="border-b last:border-b-0">
                        <td className="py-2 px-3">{row.name}</td>
                        <td className="py-2 px-3">{row.totalScore}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => setIsDialogOpen(true)}
              >
                score入力
              </button>
            </div>
          </div>
        )}

        {hasEnvVars && activeTab === "history" && (
          <div className="space-y-2">
            {isLoadingHistory && (
              <p className="text-sm text-muted-foreground">履歴を読み込み中...</p>
            )}

            {!isLoadingHistory && (
              <div className="overflow-x-auto border rounded-lg bg-background/60">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">ゲーム</th>
                      <th className="py-2 px-3">チーム</th>
                      <th className="py-2 px-3">liaos</th>
                      <th className="py-2 px-3">日時</th>
                      <th className="py-2 px-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!historyRows || historyRows.length === 0) ? (
                      <tr>
                        <td colSpan={5} className="py-3 px-3 text-muted-foreground">
                          履歴がありません。
                        </td>
                      </tr>
                    ) : (
                      historyRows.map((row) => (
                        <tr key={row.id} className="border-b last:border-b-0">
                          <td className="py-2 px-3">{row.game_name}</td>
                          <td className="py-2 px-3">{row.team_name}</td>
                          <td className="py-2 px-3">{row.score}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">
                            {formatHistoryDate(row.created_at)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              className="text-sm text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteHistory(row.id)}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {isDialogOpen && hasEnvVars && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Score入力</h2>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setIsDialogOpen(false)}
                >
                  閉じる
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">ゲームを選択してください</p>
                <div className="flex flex-wrap gap-2">
                  {["モルック", "くそげ", "ダーツ", "ボーリング"].map((game) => (
                    <button
                      key={game}
                      type="button"
                      onClick={() => setSelectedGame(game)}
                      className={`px-3 py-1 text-sm rounded-full border ${
                        selectedGame === game
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-background text-foreground border-border"
                      }`}
                    >
                      {game}
                    </button>
                  ))}
                </div>
              </div>

              {selectedGame === "モルック" && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">チームを2つ選択してください</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="space-y-1">
                        <select
                          className="w-full rounded-md border px-2 py-1 bg-background"
                          value={teamAId ?? ""}
                          onChange={(e) =>
                            setTeamAId(e.target.value ? Number(e.target.value) : null)
                          }
                        >
                          <option value="">選択してください</option>
                          {rows?.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <select
                          className="w-full rounded-md border px-2 py-1 bg-background"
                          value={teamBId ?? ""}
                          onChange={(e) =>
                            setTeamBId(e.target.value ? Number(e.target.value) : null)
                          }
                        >
                          <option value="">選択してください</option>
                          {rows?.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">各チームのScoreを入力してください</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {teamA?.name ?? ""} のScore
                        </p>
                        <input
                          type="number"
                          className="w-full rounded-md border px-2 py-1 bg-background"
                          value={teamAScore}
                          onChange={(e) => setTeamAScore(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {teamB?.name ?? ""} のScore
                        </p>
                        <input
                          type="number"
                          className="w-full rounded-md border px-2 py-1 bg-background"
                          value={teamBScore}
                          onChange={(e) => setTeamBScore(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {teamA && teamB && winner && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="font-medium">liaos の計算結果</p>
                      <p>
                        勝ち: {winner === "A" ? teamA.name : teamB.name} → {winnerValue}
                        liaos
                      </p>
                      <p>
                        負け: {loser === "A" ? teamA.name : teamB.name} → {loserValue}
                        liaos
                      </p>
                    </div>
                  )}

                  {saveError && (
                    <p className="mt-2 text-xs text-red-500">保存エラー: {saveError}</p>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1.5 text-sm"
                      onClick={() => setIsDialogOpen(false)}
                      disabled={isSaving}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      onClick={handleSaveMolkky}
                      disabled={
                        isSaving ||
                        !teamA ||
                        !teamB ||
                        teamA.id === teamB.id ||
                        teamAScore === "" ||
                        teamBScore === ""
                      }
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}

              {selectedGame === "ダーツ" && rows && (
                <DartsForm rows={rows} />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

type DartsFormProps = {
  rows: TeamRow[];
};

function DartsForm({ rows }: DartsFormProps) {
  const [scores, setScores] = useState<Record<number, string>>({});

  const parsed = rows.map((team) => {
    const raw = scores[team.id];
    const value = raw === undefined || raw === "" ? null : Number(raw);
    return { team, raw, value };
  });

  const allFilled = parsed.every((p) => p.value !== null);

  const numeric = allFilled
    ? parsed.map((p) => ({ team: p.team, value: p.value as number }))
    : [];

  const sorted = allFilled ? [...numeric].sort((a, b) => a.value - b.value) : [];

  const first = sorted[0];
  const second = sorted[1];
  const third = sorted[2];

  const firstScore = first?.value ?? 0;

  const secondDiff = second ? second.value - firstScore : 0;
  const thirdDiff = third ? third.value - firstScore : 0;

  const secondLiaos = allFilled && second ? -1000 - secondDiff * 5 : 0;
  const thirdLiaos = allFilled && third ? -2000 - thirdDiff * 10 : 0;
  const firstLiaos = allFilled && first ? -secondLiaos - thirdLiaos : 0;

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">各チームのダーツスコアを入力してください</p>
        <div className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
          {rows.map((team) => (
            <div key={team.id} className="flex items-center gap-2">
              <div className="w-32 truncate text-xs text-muted-foreground">
                {team.name}
              </div>
              <input
                type="number"
                className="flex-1 rounded-md border px-2 py-1 bg-background"
                value={scores[team.id] ?? ""}
                onChange={(e) =>
                  setScores((prev) => ({ ...prev, [team.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {rows.length >= 2 && allFilled && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">liaos の計算結果（プレビュー）</p>
          {first && (
            <p>
              1位: {first.team.name} → {firstLiaos} liaos
            </p>
          )}
          {second && (
            <p>
              2位: {second.team.name} → {secondLiaos} liaos
            </p>
          )}
          {third && (
            <p>
              3位: {third.team.name} → {thirdLiaos} liaos
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatHistoryDate(value: string): string {
  const d = new Date(value);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");

  // 年と秒は省略して「M/D HH:MM」形式で表示
  return `${month}/${day} ${hours}:${minutes}`;
}
