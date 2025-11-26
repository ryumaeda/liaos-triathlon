"use client";

import { cn, hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from "@/components/ui/menubar";
import { Spinner } from "@/components/ui/spinner";

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

type KusogeParsed = {
  team: TeamRow;
  raw: string | undefined;
  value: number | null;
};

type KusogeParticipant = {
  team: TeamRow;
  raw: string | undefined;
  value: number;
};

type BowlingEntry = {
  score: string;
  bonus: string;
  handicap: boolean;
};

type BowlingParsed = {
  team: TeamRow;
  scoreRaw: string | undefined;
  bonusRaw: string | undefined;
  handicap: boolean;
  scoreValue: number | null;
  bonusValue: number | null;
};

type BowlingParticipant = {
  team: TeamRow;
  handicap: boolean;
  effectiveScore: number;
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

export default function LiaoPage() {
  const router = useRouter();

  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string>("モルック");
  const [kusogeScores, setKusogeScores] = useState<Record<number, string>>({});
  const [bowlingEntries, setBowlingEntries] = useState<
    Record<number, BowlingEntry>
  >({});
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [teamAScore, setTeamAScore] = useState<string>("");
  const [teamBScore, setTeamBScore] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "history">("summary");
  const [historyRows, setHistoryRows] = useState<HistoryRow[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // セッションチェック（未ログインなら /login へ）
  useEffect(() => {
    if (typeof document === "undefined") return;
    const hasSession = document.cookie
      .split("; ")
      .some((c) => c.startsWith("liao_session="));

    if (!hasSession) {
      router.replace("/login");
      return;
    }

    setIsAuthorized(true);
  }, [router]);

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

        const aggregated: TeamRow[] =
          (data as RawTeamRow[] | null | undefined)?.map((row) => ({
            id: row.id,
            name: row.name,
            totalScore: Array.isArray(row.scores)
              ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
              : 0,
          })) ?? [];

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

  const winner =
    aScoreNum === bScoreNum ? null : aScoreNum > bScoreNum ? "A" : "B";
  const loser = winner === "A" ? "B" : winner === "B" ? "A" : null;

  const winnerValue = winner === "A" || winner === "B" ? 3000 + diff * 100 : 0;
  const loserValue = loser === "A" || loser === "B" ? -3000 - diff * 100 : 0;

  const handleSaveKusoge = async () => {
    if (!rows) return;

    const parsed: KusogeParsed[] = rows.map((team): KusogeParsed => {
      const raw = kusogeScores[team.id] as string | undefined;
      const value = raw === undefined || raw === "" ? null : Number(raw);
      return { team, raw, value };
    });

    const participants: KusogeParticipant[] = parsed.filter(
      (p): p is KusogeParticipant => p.value !== null && !Number.isNaN(p.value)
    );

    if (participants.length < 3) {
      setSaveError("少なくとも3チームのスコアを入力してください。");
      return;
    }

    // 同点チェック
    const kusogeScoreGroups = new Map<number, string[]>();
    participants.forEach((p) => {
      const v = p.value;
      if (v === null || Number.isNaN(v)) return;
      const list = kusogeScoreGroups.get(v) ?? [];
      list.push(p.team.name);
      kusogeScoreGroups.set(v, list);
    });
    const kusogeDuplicatedTeams = Array.from(kusogeScoreGroups.values())
      .filter((names) => names.length > 1)
      .flat();

    if (kusogeDuplicatedTeams.length > 0) {
      setSaveError(
        `スコアが同点のチームがあります（${kusogeDuplicatedTeams.join(
          "、"
        )}）。スコアを調整してから保存してください。`
      );
      return;
    }

    const sorted = [...participants].sort((a, b) => b.value - a.value);
    const first = sorted[0];
    const third = sorted[2];

    if (!first || !third) {
      setSaveError("順位の計算に失敗しました。");
      return;
    }

    const diffScore = first.value - third.value;
    const liaosAmount = 3000 + diffScore * 100;

    const payload = participants.map(({ team }) => {
      let score = 0;
      if (team.id === first.team.id) {
        score = liaosAmount;
      } else if (team.id === third.team.id) {
        score = -liaosAmount;
      }

      return {
        game_name: "くそげ",
        team_id: team.id,
        score,
      };
    });

    setIsSaving(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      const { error } = await supabase.from("scores").insert(payload);

      if (error) {
        console.error(error);
        setSaveError(error.message);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("id, name, scores(score)")
        .order("id", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSaveError(fetchError.message);
        return;
      }

      const aggregated: TeamRow[] =
        (data as RawTeamRow[] | null | undefined)?.map((row) => ({
          id: row.id,
          name: row.name,
          totalScore: Array.isArray(row.scores)
            ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
            : 0,
        })) ?? [];

      setRows(aggregated);
      setIsDialogOpen(false);
      setKusogeScores({});
      toast.success("くそげのスコアを保存しました。");

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

  const handleSaveBowling = async () => {
    if (!rows) return;

    const parsed: BowlingParsed[] = rows.map((team): BowlingParsed => {
      const entry = bowlingEntries[team.id];
      const scoreRaw = entry?.score;
      const bonusRaw = entry?.bonus;
      const handicap = entry?.handicap ?? false;

      const scoreValue =
        scoreRaw === undefined || scoreRaw === "" ? null : Number(scoreRaw);
      // ボーナスは未入力（空）の場合は 0 として扱う
      const bonusValue =
        bonusRaw === undefined || bonusRaw === "" ? 0 : Number(bonusRaw);

      return {
        team,
        scoreRaw,
        bonusRaw,
        handicap,
        scoreValue,
        bonusValue,
      };
    });

    const participants: BowlingParticipant[] = parsed
      .filter(
        (p) =>
          p.scoreValue !== null &&
          !Number.isNaN(p.scoreValue) &&
          !Number.isNaN(p.bonusValue)
      )
      .map((p): BowlingParticipant => {
        const baseScore =
          (p.scoreValue as number) + (p.bonusValue as number) * 10;
        const effectiveScore = baseScore + (p.handicap ? 60 : 0);
        return {
          team: p.team,
          handicap: p.handicap,
          effectiveScore,
        };
      });

    if (participants.length < 3) {
      setSaveError("少なくとも3チームのスコアを入力してください。");
      return;
    }

    // 同点チェック（effectiveScore 単位）
    const bowlingScoreGroups = new Map<number, string[]>();
    participants.forEach((p) => {
      const v = p.effectiveScore;
      const list = bowlingScoreGroups.get(v) ?? [];
      list.push(p.team.name);
      bowlingScoreGroups.set(v, list);
    });
    const bowlingDuplicatedTeams = Array.from(bowlingScoreGroups.values())
      .filter((names) => names.length > 1)
      .flat();

    if (bowlingDuplicatedTeams.length > 0) {
      setSaveError(
        `スコアが同点のチームがあります（${bowlingDuplicatedTeams.join(
          "、"
        )}）。スコアを調整してから保存してください。`
      );
      return;
    }

    const sorted = [...participants].sort(
      (a, b) => b.effectiveScore - a.effectiveScore
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (!first || !last) {
      setSaveError("順位の計算に失敗しました。");
      return;
    }

    const diffScore = first.effectiveScore - last.effectiveScore;
    const liaosAmount = diffScore * 100;

    const payload = participants.map(({ team }) => {
      let score = 0;
      if (team.id === first.team.id) {
        score = liaosAmount;
      } else if (team.id === last.team.id) {
        score = -liaosAmount;
      }

      return {
        game_name: "ボーリング",
        team_id: team.id,
        score,
      };
    });

    setIsSaving(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      const { error } = await supabase.from("scores").insert(payload);

      if (error) {
        console.error(error);
        setSaveError(error.message);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("id, name, scores(score)")
        .order("id", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSaveError(fetchError.message);
        return;
      }

      const aggregated: TeamRow[] =
        (data as RawTeamRow[] | null | undefined)?.map((row) => ({
          id: row.id,
          name: row.name,
          totalScore: Array.isArray(row.scores)
            ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
            : 0,
        })) ?? [];

      setRows(aggregated);
      setIsDialogOpen(false);
      setBowlingEntries({});
      toast.success("ボーリングのスコアを保存しました。");

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

      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("id, name, scores(score)")
        .order("id", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSaveError(fetchError.message);
        return;
      }

      const aggregated: TeamRow[] =
        (data as RawTeamRow[] | null | undefined)?.map((row) => ({
          id: row.id,
          name: row.name,
          totalScore: Array.isArray(row.scores)
            ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
            : 0,
        })) ?? [];

      setRows(aggregated);
      setIsDialogOpen(false);
      setTeamAId(null);
      setTeamBId(null);
      setTeamAScore("");
      setTeamBScore("");
      toast.success("モルックのスコアを保存しました。");

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
    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("scores")
      .delete()
      .eq("id", id);
    if (deleteError) {
      console.error(deleteError);
      setError(deleteError.message);
      return;
    }

    setHistoryRows((prev) => prev?.filter((row) => row.id !== id) ?? null);

    const { data, error: fetchError } = await supabase
      .from("teams")
      .select("id, name, scores(score)")
      .order("id", { ascending: true });

    if (fetchError) {
      console.error(fetchError);
      setError(fetchError.message);
      return;
    }

    const aggregated: TeamRow[] =
      (data as RawTeamRow[] | null | undefined)?.map((row) => ({
        id: row.id,
        name: row.name,
        totalScore: Array.isArray(row.scores)
          ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
          : 0,
      })) ?? [];

    setRows(aggregated);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setSelectedGame("モルック");
      setKusogeScores({});
      setBowlingEntries({});
      setTeamAId(null);
      setTeamBId(null);
      setTeamAScore("");
      setTeamBScore("");
      setSaveError(null);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted flex flex-col items-center justify-start p-6">
      <div className="w-full max-w-3xl space-y-6">
        {!hasEnvVars && (
          <p className="text-sm text-red-500">
            Supabase の環境変数が設定されていないため、DB に接続できません。
          </p>
        )}

        {error && <p className="text-sm text-red-500">エラー: {error}</p>}

        {hasEnvVars && (
          <div className="sticky top-0 z-20 flex items-center justify-between border-b pb-3 mb-4 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      onClick={() => setActiveTab("summary")}
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "h-8 px-3 text-xs",
                        activeTab === "summary"
                          ? "bg-muted text-foreground"
                          : "bg-background text-foreground"
                      )}
                    >
                      ホーム
                    </button>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "h-8 px-3 text-xs",
                        activeTab === "history"
                          ? "bg-muted text-foreground"
                          : "bg-background text-foreground"
                      )}
                    >
                      履歴
                    </button>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        )}

        {hasEnvVars && activeTab === "summary" && (
          <div className="space-y-4">
            <Card className="border border-border/60 bg-background/80">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-baseline justify-between">
                  <span className="text-base font-semibold tracking-wide">
                    Liaos ランキング
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!rows ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Spinner />
                    <span className="ml-2">読み込み中...</span>
                  </div>
                ) : rows.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    テーブル &quot;teams&quot; にデータがありません。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...rows]
                      .sort((a, b) => b.totalScore - a.totalScore)
                      .map((row, index) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-8 text-xs font-semibold text-muted-foreground">
                              {index + 1}位
                            </span>
                            <span className="font-medium">{row.name}</span>
                          </div>
                          <span className="font-mono text-sm">
                            {row.totalScore.toLocaleString()}{" "}
                            <span className="text-xs text-muted-foreground">
                              liaos
                            </span>
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground text-background px-4 py-2 text-xs font-medium tracking-wide hover:bg-foreground/90 transition-colors"
                onClick={() => setIsDialogOpen(true)}
              >
                スコア入力
              </button>
            </div>
          </div>
        )}

        {hasEnvVars && activeTab === "history" && (
          <div className="space-y-2 text-[10px]">
            {isLoadingHistory && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner />
                <span>履歴を読み込み中...</span>
              </div>
            )}

            {!isLoadingHistory && (
              <div className="overflow-x-auto border rounded-lg bg-background/60">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3">ゲーム</th>
                      <th className="py-2 px-3">チーム</th>
                      <th className="py-2 px-3">liaos</th>
                      <th className="py-2 px-3">日時</th>
                      <th className="py-2 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!historyRows || historyRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 px-3 text-muted-foreground"
                        >
                          履歴がありません。
                        </td>
                      </tr>
                    ) : (
                      historyRows.map((row) => (
                        <tr key={row.id} className="border-b last:border-b-0">
                          <td className="py-1.5 px-2">{row.game_name}</td>
                          <td className="py-1.5 px-2">{row.team_name}</td>
                          <td className="py-1.5 px-2">{row.score}</td>
                          <td className="py-1.5 px-2 text-[9px] text-muted-foreground">
                            {formatHistoryDate(row.created_at)}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-600"
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

        {hasEnvVars && (
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">ゲームを選択してください</p>
                <Menubar className="border border-border/60 bg-background/80">
                  {["モルック", "くそげ", "ダーツ", "ボーリング"].map(
                    (game) => (
                      <MenubarMenu key={game}>
                        <MenubarTrigger
                          className={cn(
                            "text-xs px-3 py-1",
                            selectedGame === game && "bg-muted text-foreground"
                          )}
                          onClick={() => setSelectedGame(game)}
                        >
                          {game}
                        </MenubarTrigger>
                      </MenubarMenu>
                    )
                  )}
                </Menubar>
              </div>

              {/* ボーリング */}
              {selectedGame === "ボーリング" && rows && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      各チームのスコアとボーナスを入力してください
                    </p>
                    <div className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
                      {rows.map((team) => {
                        const entry = bowlingEntries[team.id] ?? {
                          score: "",
                          bonus: "",
                          handicap: false,
                        };
                        return (
                          <div
                            key={team.id}
                            className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
                          >
                            <div className="truncate text-xs text-muted-foreground">
                              {team.name}
                            </div>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              placeholder="スコアを入力"
                              value={entry.score}
                              onChange={(e) =>
                                setBowlingEntries((prev) => ({
                                  ...prev,
                                  [team.id]: {
                                    score: e.target.value,
                                    bonus: prev[team.id]?.bonus ?? "",
                                    handicap: prev[team.id]?.handicap ?? false,
                                  },
                                }))
                              }
                            />
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              placeholder="ボーナスを入力"
                              value={entry.bonus}
                              onChange={(e) =>
                                setBowlingEntries((prev) => ({
                                  ...prev,
                                  [team.id]: {
                                    score: prev[team.id]?.score ?? "",
                                    bonus: e.target.value,
                                    handicap: prev[team.id]?.handicap ?? false,
                                  },
                                }))
                              }
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={entry.handicap}
                                onCheckedChange={(checked) =>
                                  setBowlingEntries((prev) => ({
                                    ...prev,
                                    [team.id]: {
                                      score: prev[team.id]?.score ?? "",
                                      bonus: prev[team.id]?.bonus ?? "",
                                      handicap: checked === true,
                                    },
                                  }))
                                }
                              />
                              <span>ハンデ(+60)</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {(() => {
                    const parsed: BowlingParsed[] =
                      rows?.map((team): BowlingParsed => {
                        const entry = bowlingEntries[team.id];
                        const scoreRaw = entry?.score;
                        const bonusRaw = entry?.bonus;
                        const handicap = entry?.handicap ?? false;

                        const scoreValue =
                          scoreRaw === undefined || scoreRaw === ""
                            ? null
                            : Number(scoreRaw);
                        // ボーナスは未入力（空）の場合は 0 として扱う
                        const bonusValue =
                          bonusRaw === undefined || bonusRaw === ""
                            ? 0
                            : Number(bonusRaw);

                        return {
                          team,
                          scoreRaw,
                          bonusRaw,
                          handicap,
                          scoreValue,
                          bonusValue,
                        };
                      }) ?? [];

                    const participants: BowlingParticipant[] = parsed
                      .filter(
                        (p) =>
                          p.scoreValue !== null &&
                          !Number.isNaN(p.scoreValue) &&
                          !Number.isNaN(p.bonusValue)
                      )
                      .map((p): BowlingParticipant => {
                        const baseScore =
                          (p.scoreValue as number) +
                          (p.bonusValue as number) * 10;
                        const effectiveScore =
                          baseScore + (p.handicap ? 60 : 0);
                        return {
                          team: p.team,
                          handicap: p.handicap,
                          effectiveScore,
                        };
                      });

                    if (participants.length < 3) return null;

                    const sorted = [...participants].sort(
                      (a, b) => b.effectiveScore - a.effectiveScore
                    );
                    const first = sorted[0];
                    const last = sorted[sorted.length - 1];

                    if (!first || !last) return null;

                    // 同点チェック（effectiveScore 単位）
                    const scoreGroups = new Map<number, string[]>();
                    participants.forEach((p) => {
                      const v = p.effectiveScore;
                      const list = scoreGroups.get(v) ?? [];
                      list.push(p.team.name);
                      scoreGroups.set(v, list);
                    });
                    const duplicatedTeams = Array.from(scoreGroups.values())
                      .filter((names) => names.length > 1)
                      .flat();
                    const hasTies = duplicatedTeams.length > 0;

                    // 同点がある場合は計算結果は表示せず、警告のみ表示
                    if (hasTies) {
                      return (
                        <div className="space-y-1 text-sm">
                          <p className="text-xs text-orange-500">
                            スコアが同点のチームがあります（
                            {duplicatedTeams.join("、")}
                            ）。スコアを調整してから保存してください。
                          </p>
                        </div>
                      );
                    }

                    const diffScore =
                      first.effectiveScore - last.effectiveScore;
                    const liaosAmount = diffScore * 100;

                    return (
                      <div className="space-y-1 text-sm">
                        <p>
                          1位: {first.team.name} → {liaosAmount} liaos
                        </p>
                        <p>
                          最下位: {last.team.name} → {-liaosAmount} liaos
                        </p>
                      </div>
                    );
                  })()}

                  {saveError && (
                    <p className="mt-2 text-xs text-red-500">
                      保存エラー: {saveError}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs"
                      onClick={() => handleDialogOpenChange(false)}
                      disabled={isSaving}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
                      onClick={handleSaveBowling}
                      disabled={
                        isSaving ||
                        !rows ||
                        (rows &&
                          Object.values(bowlingEntries).filter((entry) => {
                            if (!entry) return false;
                            const hasScore =
                              entry.score !== undefined && entry.score !== "";
                            return hasScore;
                          }).length < 3) ||
                        // 同点がある場合は保存ボタンを無効化
                        (() => {
                          if (!rows) return false;

                          const parsed: BowlingParsed[] =
                            rows?.map((team): BowlingParsed => {
                              const entry = bowlingEntries[team.id];
                              const scoreRaw = entry?.score;
                              const bonusRaw = entry?.bonus;
                              const handicap = entry?.handicap ?? false;

                              const scoreValue =
                                scoreRaw === undefined || scoreRaw === ""
                                  ? null
                                  : Number(scoreRaw);
                              const bonusValue =
                                bonusRaw === undefined || bonusRaw === ""
                                  ? 0
                                  : Number(bonusRaw);

                              return {
                                team,
                                scoreRaw,
                                bonusRaw,
                                handicap,
                                scoreValue,
                                bonusValue,
                              };
                            }) ?? [];

                          const participants: BowlingParticipant[] = parsed
                            .filter(
                              (p) =>
                                p.scoreValue !== null &&
                                !Number.isNaN(p.scoreValue) &&
                                !Number.isNaN(p.bonusValue)
                            )
                            .map((p): BowlingParticipant => {
                              const baseScore =
                                (p.scoreValue as number) +
                                (p.bonusValue as number) * 10;
                              const effectiveScore =
                                baseScore + (p.handicap ? 60 : 0);
                              return {
                                team: p.team,
                                handicap: p.handicap,
                                effectiveScore,
                              };
                            });

                          if (participants.length < 3) return true;

                          const scoreGroups = new Map<number, number>();
                          for (const p of participants) {
                            const v = p.effectiveScore;
                            const count = scoreGroups.get(v) ?? 0;
                            if (count >= 1) {
                              // 同じスコアが2回以上出たら同点
                              return true;
                            }
                            scoreGroups.set(v, count + 1);
                          }

                          return false;
                        })()
                      }
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}

              {/* くそげ */}
              {selectedGame === "くそげ" && rows && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      各チームのスコアを入力してください
                    </p>
                    <div className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
                      {rows.map((team) => (
                        <div key={team.id} className="flex items-center gap-2">
                          <div className="w-32 truncate text-xs text-muted-foreground">
                            {team.name}
                          </div>
                          <Input
                            type="number"
                            className="flex-1 h-8 text-xs"
                            placeholder="スコアを入力"
                            value={kusogeScores[team.id] ?? ""}
                            onChange={(e) =>
                              setKusogeScores((prev) => ({
                                ...prev,
                                [team.id]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const parsed: KusogeParsed[] =
                      rows?.map((team): KusogeParsed => {
                        const raw = kusogeScores[team.id] as string | undefined;
                        const value =
                          raw === undefined || raw === "" ? null : Number(raw);
                        return { team, raw, value };
                      }) ?? [];

                    const participants: KusogeParticipant[] = parsed.filter(
                      (p): p is KusogeParticipant =>
                        p.value !== null && !Number.isNaN(p.value)
                    );

                    if (participants.length < 3) return null;

                    const sorted = [...participants].sort(
                      (a, b) => b.value - a.value
                    );
                    const first = sorted[0];
                    const third = sorted[2];

                    if (!first || !third) return null;

                    // 同点チェック
                    const scoreGroups = new Map<number, string[]>();
                    participants.forEach((p) => {
                      const v = p.value;
                      const list = scoreGroups.get(v) ?? [];
                      list.push(p.team.name);
                      scoreGroups.set(v, list);
                    });
                    const duplicatedTeams = Array.from(scoreGroups.values())
                      .filter((names) => names.length > 1)
                      .flat();
                    const hasTies = duplicatedTeams.length > 0;

                    // 同点がある場合は計算結果は表示せず、警告のみ表示
                    if (hasTies) {
                      return (
                        <div className="space-y-1 text-sm">
                          <p className="text-xs text-orange-500">
                            スコアが同点のチームがあります（
                            {duplicatedTeams.join("、")}
                            ）。スコアを調整してから保存してください。
                          </p>
                        </div>
                      );
                    }

                    const diffScore = first.value - third.value;
                    const liaosAmount = 3000 + diffScore * 100;

                    return (
                      <div className="space-y-1 text-sm">
                        <p>
                          1位: {first.team.name} → {liaosAmount} liaos
                        </p>
                        <p>
                          3位: {third.team.name} → {-liaosAmount} liaos
                        </p>
                      </div>
                    );
                  })()}

                  {saveError && (
                    <p className="mt-2 text-xs text-red-500">
                      保存エラー: {saveError}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs"
                      onClick={() => handleDialogOpenChange(false)}
                      disabled={isSaving}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
                      onClick={handleSaveKusoge}
                      disabled={
                        isSaving ||
                        !rows ||
                        (rows &&
                          Object.values(kusogeScores).filter(
                            (v) => v !== undefined && v !== ""
                          ).length < 3) ||
                        // 同点がある場合は保存ボタンを無効化
                        (() => {
                          if (!rows) return false;

                          const parsed: KusogeParsed[] =
                            rows?.map((team): KusogeParsed => {
                              const raw = kusogeScores[team.id] as
                                | string
                                | undefined;
                              const value =
                                raw === undefined || raw === ""
                                  ? null
                                  : Number(raw);
                              return { team, raw, value };
                            }) ?? [];

                          const participants: KusogeParticipant[] =
                            parsed.filter(
                              (p): p is KusogeParticipant =>
                                p.value !== null && !Number.isNaN(p.value)
                            );

                          if (participants.length < 3) return true;

                          const scoreGroups = new Map<number, number>();
                          for (const p of participants) {
                            const v = p.value;
                            const count = scoreGroups.get(v) ?? 0;
                            if (count >= 1) {
                              // 同じスコアが2回以上出たら同点
                              return true;
                            }
                            scoreGroups.set(v, count + 1);
                          }

                          return false;
                        })()
                      }
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}

              {/* モルック */}
              {selectedGame === "モルック" && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      チームを選択してください
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <Select
                          value={teamAId ? String(teamAId) : ""}
                          onValueChange={(value) =>
                            setTeamAId(value ? Number(value) : null)
                          }
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="チームを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {rows?.map((team) => (
                              <SelectItem key={team.id} value={String(team.id)}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Select
                          value={teamBId ? String(teamBId) : ""}
                          onValueChange={(value) =>
                            setTeamBId(value ? Number(value) : null)
                          }
                        >
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="チームを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {rows?.map((team) => (
                              <SelectItem key={team.id} value={String(team.id)}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      各チームのスコアを入力してください
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {teamA?.name ?? ""} のスコア
                        </p>
                        <Input
                          type="number"
                          className="w-full h-8 text-xs"
                          placeholder="スコアを入力"
                          value={teamAScore}
                          onChange={(e) => setTeamAScore(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {teamB?.name ?? ""} のスコア
                        </p>
                        <Input
                          type="number"
                          className="w-full h-8 text-xs"
                          placeholder="スコアを入力"
                          value={teamBScore}
                          onChange={(e) => setTeamBScore(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {teamA && teamB && teamAScore !== "" && teamBScore !== "" && (
                    <div className="mt-2 space-y-1 text-sm">
                      {aScoreNum === bScoreNum ? (
                        <p className="text-xs text-orange-500">
                          スコアが同点のため、勝敗をつけられません。スコアを調整してから保存してください。
                        </p>
                      ) : (
                        <>
                          <p>
                            勝ち: {winner === "A" ? teamA.name : teamB.name} →{" "}
                            {winnerValue}
                            liaos
                          </p>
                          <p>
                            負け: {loser === "A" ? teamA.name : teamB.name} →{" "}
                            {loserValue}
                            liaos
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {saveError && (
                    <p className="mt-2 text-xs text-red-500">
                      保存エラー: {saveError}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs"
                      onClick={() => handleDialogOpenChange(false)}
                      disabled={isSaving}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
                      onClick={handleSaveMolkky}
                      disabled={
                        isSaving ||
                        !teamA ||
                        !teamB ||
                        teamA.id === teamB.id ||
                        teamAScore === "" ||
                        teamBScore === "" ||
                        aScoreNum === bScoreNum
                      }
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              )}

              {/* ダーツ */}
              {selectedGame === "ダーツ" && rows && (
                <DartsForm
                  rows={rows}
                  isSaving={isSaving}
                  saveError={saveError}
                  activeTab={activeTab}
                  onClose={() => handleDialogOpenChange(false)}
                  setIsSaving={setIsSaving}
                  setSaveError={setSaveError}
                  setRows={setRows}
                  setHistoryRows={setHistoryRows}
                />
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </main>
  );
}

type DartsFormProps = {
  rows: TeamRow[];
  isSaving: boolean;
  saveError: string | null;
  activeTab: "summary" | "history";
  onClose: () => void;
  setIsSaving: (value: boolean) => void;
  setSaveError: (value: string | null) => void;
  setRows: (rows: TeamRow[] | null) => void;
  setHistoryRows: (rows: HistoryRow[] | null) => void;
};

function DartsForm({
  rows,
  isSaving,
  saveError,
  activeTab,
  onClose,
  setIsSaving,
  setSaveError,
  setRows,
  setHistoryRows,
}: DartsFormProps) {
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

  const sorted = allFilled
    ? [...numeric].sort((a, b) => a.value - b.value)
    : [];

  const first = sorted[0];
  const second = sorted[1];
  const third = sorted[2];

  const firstScore = first?.value ?? 0;

  const secondDiff = second ? second.value - firstScore : 0;
  const thirdDiff = third ? third.value - firstScore : 0;

  const secondLiaos = allFilled && second ? -1000 - secondDiff * 5 : 0;
  const thirdLiaos = allFilled && third ? -2000 - thirdDiff * 10 : 0;
  const firstLiaos = allFilled && first ? -secondLiaos - thirdLiaos : 0;

  // プレビュー用：同点チェック
  const dartsScoreGroupsPreview = new Map<number, string[]>();
  if (allFilled) {
    numeric.forEach((p) => {
      const v = p.value;
      const list = dartsScoreGroupsPreview.get(v) ?? [];
      list.push(p.team.name);
      dartsScoreGroupsPreview.set(v, list);
    });
  }
  const dartsDuplicatedTeamsPreview = Array.from(
    dartsScoreGroupsPreview.values()
  )
    .filter((names) => names.length > 1)
    .flat();
  const hasTiesPreview = dartsDuplicatedTeamsPreview.length > 0;

  const handleSaveDarts = async () => {
    if (!rows.length || !allFilled || !first) return;

    // 同点チェック
    const dartsScoreGroups = new Map<number, string[]>();
    numeric.forEach((p) => {
      const v = p.value;
      const list = dartsScoreGroups.get(v) ?? [];
      list.push(p.team.name);
      dartsScoreGroups.set(v, list);
    });
    const dartsDuplicatedTeams = Array.from(dartsScoreGroups.values())
      .filter((names) => names.length > 1)
      .flat();

    if (dartsDuplicatedTeams.length > 0) {
      setSaveError(
        `スコアが同点のチームがあります（${dartsDuplicatedTeams.join(
          "、"
        )}）。スコアを調整してから保存してください。`
      );
      return;
    }

    const supabase = createClient();

    // 各チームのliaosを決定（1位/2位/3位以外は0）
    const liaosByTeam = new Map<number, number>();
    rows.forEach((team) => liaosByTeam.set(team.id, 0));

    liaosByTeam.set(first.team.id, firstLiaos);
    if (second) liaosByTeam.set(second.team.id, secondLiaos);
    if (third) liaosByTeam.set(third.team.id, thirdLiaos);

    const payload = rows.map((team) => ({
      game_name: "ダーツ",
      team_id: team.id,
      score: liaosByTeam.get(team.id) ?? 0,
    }));

    setIsSaving(true);
    setSaveError(null);

    try {
      const { error } = await supabase.from("scores").insert(payload);

      if (error) {
        console.error(error);
        setSaveError(error.message);
        return;
      }

      // teams を再読み込みして合計スコアを更新
      const { data, error: fetchError } = await supabase
        .from("teams")
        .select("id, name, scores(score)")
        .order("id", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSaveError(fetchError.message);
        return;
      }

      const aggregated: TeamRow[] =
        (data as RawTeamRow[] | null | undefined)?.map((row) => ({
          id: row.id,
          name: row.name,
          totalScore: Array.isArray(row.scores)
            ? row.scores.reduce((sum, s) => sum + (s?.score ?? 0), 0)
            : 0,
        })) ?? [];

      setRows(aggregated);
      toast.success("ダーツのスコアを保存しました。");
      onClose();

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

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          各チームのダーツスコアを入力してください
        </p>
        <div className="space-y-2 text-sm max-h-64 overflow-y-auto pr-1">
          {rows.map((team) => (
            <div key={team.id} className="flex items-center gap-2">
              <div className="w-32 truncate text-xs text-muted-foreground">
                {team.name}
              </div>
              <Input
                type="number"
                className="flex-1 h-8 text-xs"
                placeholder="スコアを入力"
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
          {hasTiesPreview ? (
            <p className="text-xs text-orange-500">
              スコアが同点のチームがあります（
              {dartsDuplicatedTeamsPreview.join("、")}
              ）。スコアを調整してから保存してください。
            </p>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {saveError && (
        <p className="mt-2 text-xs text-red-500">保存エラー: {saveError}</p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-full border px-3 py-1.5 text-xs"
          onClick={onClose}
          disabled={isSaving}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          onClick={handleSaveDarts}
          disabled={
            isSaving ||
            !allFilled ||
            rows.length < 2 ||
            // 同点がある場合は保存ボタンを無効化
            (() => {
              if (!allFilled) return false;

              const scoreGroups = new Map<number, number>();
              for (const p of numeric) {
                const v = p.value;
                const count = scoreGroups.get(v) ?? 0;
                if (count >= 1) {
                  // 同じスコアが2回以上出たら同点
                  return true;
                }
                scoreGroups.set(v, count + 1);
              }

              return false;
            })()
          }
        >
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

function formatHistoryDate(value: string): string {
  const d = new Date(value);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");

  return `${month}/${day} ${hours}:${minutes}`;
}
