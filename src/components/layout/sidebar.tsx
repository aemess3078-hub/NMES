'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Folder,
  FolderOpen,
  Table,
  Layout,
  GitBranch,
  Wrench,
  LogOut,
  Hash,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveMenuPath } from '@/types/menu';
import { useAppStore } from '@/stores/app.store';
import { createClient } from '@/lib/supabase/client';
import type { MenuTree } from '@/types';

const ICON_MAP: Record<string, React.ElementType> = {
  Database, Folder, FolderOpen, Table, Layout, GitBranch, Wrench, Hash, FileText,
};

function DynamicIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Hash;
  return <Icon className={cn('h-3.5 w-3.5', className)} />;
}

function MenuItemNode({ item, depth }: { item: MenuTree; depth: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { expandedMenuIds, toggleMenuExpand, setActiveMenu } = useAppStore();

  const isFolder = item.menuType === 'FOLDER';
  const isDivider = item.menuType === 'DIVIDER';
  const hasChildren = item.children.length > 0;
  const isExpanded = expandedMenuIds.includes(item.id);
  const href = resolveMenuPath(item);
  const isActive = pathname === href && href !== '#';

  if (isDivider) {
    return <div className="my-1 mx-3 h-px bg-border" />;
  }

  const handleClick = () => {
    if (isFolder) {
      toggleMenuExpand(item.id);
    } else {
      setActiveMenu(item.id);
      if (href !== '#') router.push(href);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded px-2 py-1.5 cursor-pointer transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground font-semibold'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground font-medium',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
      >
        {(isFolder || hasChildren) ? (
          <span className="flex-shrink-0 text-muted-foreground/60">
            {isExpanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <DynamicIcon
          name={isFolder ? (isExpanded ? 'FolderOpen' : 'Folder') : item.icon}
          className="flex-shrink-0 opacity-60"
        />
        <span className="truncate flex-1 text-[14px]">{item.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children.map((child) => (
            <MenuItemNode key={child.id} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  menuTree: MenuTree[];
  userName?: string;
  userEmail?: string;
}

export function Sidebar({ menuTree, userName, userEmail }: SidebarProps) {
  const { isSidebarOpen, _hasHydrated } = useAppStore();
  const open = _hasHydrated ? isSidebarOpen : true;
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-sidebar transition-all duration-200 select-none',
        open ? 'w-60' : 'w-0 overflow-hidden'
      )}
    >
      {/* 워크스페이스 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-3 hover:bg-sidebar-accent rounded mx-1 mt-1 cursor-pointer transition-colors"
        onClick={() => router.push('/app')}
      >
        <div className="w-5 h-5 rounded bg-foreground/90 flex items-center justify-center text-background text-[10px] font-bold flex-shrink-0">
          M
        </div>
        <span className="text-[14px] font-semibold text-sidebar-foreground truncate">
          Cloud MES
        </span>
      </div>

      {/* 메뉴 */}
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5">
        {menuTree.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">메뉴가 없습니다</p>
          </div>
        ) : (
          menuTree.map((item) => (
            <MenuItemNode key={item.id} item={item} depth={0} />
          ))
        )}

        <div className="my-1 mx-2 h-px bg-border" />

        <div
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[14px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
          onClick={() => router.push('/app/builder/schemas')}
        >
          <Wrench className="h-4 w-4 opacity-60 flex-shrink-0" />
          <span>스키마 빌더</span>
        </div>
        <div
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[14px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
          onClick={() => router.push('/app/builder/flows')}
        >
          <GitBranch className="h-4 w-4 opacity-60 flex-shrink-0" />
          <span>플로우 빌더</span>
        </div>
        <div
          className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[14px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
          onClick={() => router.push('/app/builder/menu')}
        >
          <Layout className="h-4 w-4 opacity-60 flex-shrink-0" />
          <span>메뉴 빌더</span>
        </div>
      </div>

      {/* 사용자 */}
      <div className="px-1 py-2 border-t border-sidebar-border">
        <div className="flex items-center gap-2 rounded px-2 py-1.5">
          <div className="w-5 h-5 rounded bg-muted-foreground/20 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
            {userName?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">
              {userName ?? '사용자'}
            </p>
            <p className="text-[13px] text-muted-foreground truncate leading-tight">
              {userEmail ?? ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors mt-0.5"
        >
          <LogOut className="h-3 w-3 opacity-60" />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
