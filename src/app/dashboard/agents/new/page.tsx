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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label htmlFor="nationality">국적</Label>
                <Input
                  id="nationality"
                  name="nationality"
                  placeholder="예: 한국, 미국, 일본"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="major">전공</Label>
                <Select
                  id="major"
                  name="major"
                  placeholder="전공을 선택해주세요"
                  disabled={isLoading}
                >
                  <option value="">선택해주세요</option>
                  <option value="컴퓨터공학">컴퓨터공학</option>
                  <option value="산업디자인">산업디자인</option>
                  <option value="경영학">경영학</option>
                  <option value="심리학">심리학</option>
                  <option value="마케팅학">마케팅학</option>
                  <option value="시각디자인">시각디자인</option>
                  <option value="정보시스템">정보시스템</option>
                  <option value="통계학">통계학</option>
                  <option value="언론정보학">언론정보학</option>
                  <option value="인문학">인문학</option>
                  <option value="직접입력">직접 입력</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="education">교육 수준</Label>
                <Select
                  id="education"
                  name="education"
                  placeholder="교육 수준을 선택해주세요"
                  disabled={isLoading}
                >
                  <option value="">선택해주세요</option>
                  <option value="고졸">고졸</option>
                  <option value="대졸">대졸</option>
                  <option value="석사">석사</option>
                  <option value="박사">박사</option>
                  <option value="기타">기타</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="professional">직업/전문성</Label>
              <Input
                id="professional"
                name="professional"
                placeholder="예: UX/UI 디자이너, 프론트엔드 개발자, 프로덕트 매니저"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skills">스킬셋 *</Label>
              <Textarea
                id="skills"
                name="skills"
                placeholder="예: Figma, Sketch, React, TypeScript, 사용자 인터뷰, 프로토타이핑"
                required
                disabled={isLoading}
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="personality">성격 *</Label>
              <Textarea
                id="personality"
                name="personality"
                placeholder="예: 창의적이고 도전적인 성격. 새로운 아이디어를 제안하는 것을 좋아하며, 팀워크를 중시합니다."
                required
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
              <Label htmlFor="workStyle">업무 방식(스타일) *</Label>
              <Textarea
                id="workStyle"
                name="workStyle"
                placeholder="예: 체계적이고 계획적인 업무 방식을 선호함"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferences">선호하는 것 *</Label>
              <Textarea
                id="preferences"
                name="preferences"
                placeholder="예: 미니멀하면서도 감각적인 디자인, 협업적인 환경"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dislikes">싫어하는 것 *</Label>
              <Textarea
                id="dislikes"
                name="dislikes"
                placeholder="예: 지나치게 복잡한 인터페이스, 비효율적인 프로세스"
                required
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
