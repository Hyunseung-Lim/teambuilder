import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { User, Users, Plus, LogOut } from "lucide-react";

async function signOutAction() {
  "use server";
  redirect("/api/auth/signout");
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900">
                AI 팀 빌더
              </Link>
            </div>

            <nav className="hidden md:flex space-x-8">
              <Link
                href="/dashboard/agents"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                에이전트 관리
              </Link>
              <Link
                href="/dashboard/teams"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                팀 관리
              </Link>
            </nav>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {session.user.name || session.user.email}
              </span>
              <form action={signOutAction}>
                <Button variant="ghost" size="sm" type="submit">
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main>{children}</main>
    </div>
  );
}
