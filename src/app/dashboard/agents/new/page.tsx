"use client";

import { useState } from "react";
import { createAgentAction } from "@/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewAgentPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      await createAgentAction(formData);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "에이전트 생성에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          새 AI 에이전트 만들기
        </h1>
        <p className="text-gray-600">
          당신만의 특별한 AI 에이전트를 생성하고 팀에 추가해보세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>에이전트 정보</CardTitle>
          <CardDescription>
            에이전트의 기본 정보와 성격을 입력해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름 *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="예: 김디자인"
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">나이 *</Label>
                <Input
                  id="age"
                  name="age"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="25"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">성별 *</Label>
              <Select
                id="gender"
                name="gender"
                placeholder="성별을 선택해주세요"
                required
                disabled={isLoading}
              >
                <option value="여자">여자</option>
                <option value="남자">남자</option>
                <option value="정의하지 않음">정의하지 않음</option>
                <option value="알 수 없음">알 수 없음</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="personality">성격</Label>
              <Textarea
                id="personality"
                name="personality"
                placeholder="예: 창의적이고 도전적인 성격. 새로운 아이디어를 제안하는 것을 좋아하며, 팀워크를 중시합니다."
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">가치관</Label>
              <Textarea
                id="value"
                name="value"
                placeholder="예: 사용자 중심의 디자인을 추구하며, 접근성과 지속가능성을 중요하게 생각합니다."
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="designStyle">추구하는 디자인</Label>
              <Textarea
                id="designStyle"
                name="designStyle"
                placeholder="예: 미니멀하고 깔끔한 디자인을 선호하며, 타이포그래피와 여백을 중시합니다."
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "생성 중..." : "에이전트 생성"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                disabled={isLoading}
              >
                취소
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
