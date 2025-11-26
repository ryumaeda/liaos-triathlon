"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export default function LoginPage() {
  const [loginCode, setLoginCode] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const hasSession = document.cookie
      .split("; ")
      .some((c) => c.startsWith("liao_session="));
    if (hasSession) {
      router.replace("/liao");
    }
  }, [router]);

  const handleLoginWithOtp = async () => {
    if (!hasEnvVars) return;
    if (loginCode.length !== 7) {
      setLoginError("7文字のコードを入力してください。");
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    const supabase = createClient();

    try {
      const { data, error: loginDbError } = await supabase
        .from("login")
        .select("id")
        .eq("pass", loginCode)
        .limit(1);

      if (loginDbError) {
        console.error(loginDbError);
        setLoginError("ログイン処理中にエラーが発生しました。");
        toast.error("ログインに失敗しました。");
        return;
      }

      const matched = Array.isArray(data) && data.length > 0;

      if (!matched) {
        setLoginError("コードが正しくありません。");
        toast.error("ログインに失敗しました。");
        return;
      }

      // 簡易セッション（1週間）
      document.cookie = "liao_session=1; Path=/; Max-Age=604800; SameSite=Lax";

      toast.success("ログインに成功しました。");
      router.replace("/liao");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {!hasEnvVars && (
          <p className="mb-4 text-sm text-red-500">
            Supabase の環境変数が設定されていないため、DB に接続できません。
          </p>
        )}

        <Card className="border border-border/60 bg-background/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide">
              秘密の言葉
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-col items-center gap-3">
              <InputOTP
                maxLength={7}
                value={loginCode}
                onChange={(value) => setLoginCode(value)}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  {Array.from({ length: 7 }).map((_, index) => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border px-3 py-1.5 text-xs"
                  onClick={() => {
                    setLoginCode("");
                    setLoginError(null);
                  }}
                  disabled={isLoggingIn}
                >
                  クリア
                </button>
                <button
                  type="button"
                  className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
                  onClick={handleLoginWithOtp}
                  disabled={isLoggingIn || loginCode.length !== 7}
                >
                  {isLoggingIn ? "確認中..." : "ログイン"}
                </button>
              </div>

              {loginError && (
                <p className="text-xs text-red-500">{loginError}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
