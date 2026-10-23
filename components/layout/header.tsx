"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown, Menu, Minus, Pencil, Plus, Square, SquareStack, Trash2, X } from "lucide-react";
import { useProjectStore, type Project } from "@/stores/ProjectStore";
import { NewProjectDialog } from "@/components/dialogs/new-project-dialog";
import { EditProjectDialog } from "@/components/dialogs/edit-project-dialog";
import { DeleteProjectDialog } from "@/components/dialogs/delete-project-dialog";
import { ModeToggle } from "@/components/custom/color-mode-toggle";
import { LanguageModeToggle } from "@/components/custom/language-mode-toggle";
import { PhoneRemoteButton } from "@/components/custom/phone-remote-button";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface HeaderProps {
  lang: Locale;
  dictionary: Dictionary["header"];
  projects?: Project[];
  loading?: boolean;
}

export function Header({ lang, dictionary, projects = [], loading = false }: HeaderProps) {
  const { selectedProject, selectProjectById } = useProjectStore();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);

  const monitorHref = `/${lang}/control`;
  const workspaceHref = `/${lang}/workspace`;
  const healthHref = `/${lang}/health`;
  const navLinks = [
    { label: dictionary.workspace, href: workspaceHref },
    { label: dictionary.monitor, href: monitorHref },
    { label: dictionary.health, href: healthHref }
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronWindow?.isDesktop) {
      return;
    }

    setIsDesktop(true);
    void window.electronWindow.isMaximized().then(setIsMaximized);
    void window.electronWindow.getPlatform().then((platform) => {
      setIsMac(platform === "darwin");
    });
    const unsubscribe = window.electronWindow.onMaximizedChange(setIsMaximized);
    return unsubscribe;
  }, []);

  return (
    <>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <EditProjectDialog
        project={editProject}
        open={editProject !== null}
        onOpenChange={(open) => {
          if (!open) setEditProject(null);
        }}
      />
      <DeleteProjectDialog
        project={deleteProject}
        open={deleteProject !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProject(null);
        }}
      />
      <header
        className={
          isDesktop
            ? "app-region-drag border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
            : "border-b bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
        }
        onDoubleClick={() => {
          if (isDesktop) void window.electronWindow?.toggleMaximize();
        }}
      >
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5">
          {isDesktop ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/12 via-background/0 to-primary/5 opacity-80" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-56 bg-gradient-to-r from-primary/18 via-primary/6 to-transparent blur-2xl" />
            </>
          ) : null}
          {/* Left — logo + hamburger */}
          <div className="relative z-10 flex items-center gap-4">
            <div className="app-region-no-drag">
              {mounted ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="h-4.5 w-4.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <Link href={workspaceHref}>{dictionary.workspace}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={monitorHref}>{dictionary.monitor}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={healthHref}>{dictionary.health}</Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="ghost" size="icon" disabled>
                  <Menu className="h-4.5 w-4.5" />
                </Button>
              )}
            </div>

            {isDesktop ? (
              <Link href={monitorHref} className="app-region-no-drag flex min-w-0 items-center gap-2">
                <Image src="/logo.ico" alt="CK Logo" width={24} height={24} className="shrink-0" />
                <span className="text-sm font-semibold truncate hidden sm:block">{dictionary.appTitle}</span>
              </Link>
            ) : (
              <Link href={monitorHref} className="app-region-no-drag flex min-w-0 items-center gap-2">
                <Image src="/logo.ico" alt="CK Logo" width={24} height={24} className="shrink-0" />
                <span className="text-sm font-semibold truncate hidden sm:block">{dictionary.appTitle}</span>
              </Link>
            )}
          </div>

          {/* Center — nav toggle group */}
          <div className="relative z-10 flex justify-center">
            <ToggleGroup
              className="app-region-no-drag"
              type="single"
              variant="outline"
              value={pathname}
              onValueChange={(v) => {
                if (v) router.push(v);
              }}
            >
              {navLinks.map(({ label, href }) => (
                <ToggleGroupItem key={href} value={href} aria-label={`Go to ${label}`} className="px-4">
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Right — theme toggle + project selector */}
          <div className="relative z-10 flex items-center justify-end gap-2">
            <div className="app-region-no-drag flex items-center gap-2">
              {mounted ? (
                <>
                  <PhoneRemoteButton />
                  <ModeToggle />
                  <LanguageModeToggle
                    lang={lang}
                    label={dictionary.language}
                    englishLabel={dictionary.english}
                    germanLabel={dictionary.german}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-36 min-w-0 justify-between font-normal"
                        disabled={loading}
                      >
                        <span className="truncate">
                          {loading ? dictionary.loading : (selectedProject?.name ?? dictionary.selectProject)}
                        </span>
                        <ChevronDown className="ml-1 size-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {projects.map((project) => (
                        <DropdownMenuItem
                          key={project.id}
                          onSelect={() => selectProjectById(project.id)}
                          className="flex items-center justify-between gap-1 pr-1"
                        >
                          <span
                            className={`truncate flex-1 ${selectedProject?.id === project.id ? "font-medium" : ""}`}
                          >
                            {project.name}
                          </span>
                          <span className="flex items-center gap-0.5 shrink-0">
                            <button
                              className="rounded p-0.5 hover:bg-accent hover:text-accent-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setEditProject(project);
                              }}
                              aria-label={`Edit ${project.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDeleteProject(project);
                              }}
                              aria-label={`Delete ${project.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </span>
                        </DropdownMenuItem>
                      ))}
                      {projects.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem onSelect={() => setNewProjectOpen(true)} className="text-muted-foreground">
                        <Plus className="mr-1 size-4" />
                        {dictionary.newProject}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Button variant="outline" size="icon-sm" disabled aria-label={dictionary.language} />
                  <Button variant="outline" size="icon-sm" disabled aria-label="Theme toggle" />
                  <Button variant="outline" size="sm" className="w-36 min-w-0 justify-between font-normal" disabled>
                    <span className="truncate">{dictionary.loading}</span>
                    <ChevronDown className="ml-1 size-4 shrink-0 text-muted-foreground" />
                  </Button>
                </>
              )}

              {isDesktop && !isMac ? (
                <div className="flex items-center overflow-hidden rounded-[min(var(--radius-md),10px)] border border-border bg-card/85 dark:bg-muted/50">
                  <WindowButton
                    label="Minimize"
                    position="start"
                    onClick={() => void window.electronWindow?.minimize()}
                  >
                    <Minus className="size-4" />
                  </WindowButton>
                  <WindowButton
                    label={isMaximized ? "Restore" : "Maximize"}
                    position="middle"
                    onClick={() => void window.electronWindow?.toggleMaximize()}
                  >
                    {isMaximized ? <SquareStack className="size-3.5" /> : <Square className="size-3.5" />}
                  </WindowButton>
                  <WindowButton label="Close" danger position="end" onClick={() => void window.electronWindow?.close()}>
                    <X className="size-4" />
                  </WindowButton>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

function WindowButton({
  children,
  label,
  danger = false,
  position = "middle",
  onClick
}: {
  children: ReactNode;
  label: string;
  danger?: boolean;
  position?: "start" | "middle" | "end";
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onClick}
      className={
        danger
          ? [
              "h-8 w-9 rounded-none border-0 shadow-none text-muted-foreground",
              position === "start" ? "rounded-l-[min(var(--radius-md),10px)]" : "",
              position === "end" ? "rounded-r-[min(var(--radius-md),10px)]" : "",
              "hover:bg-destructive/10 hover:text-destructive"
            ].join(" ")
          : [
              "h-8 w-9 rounded-none border-0 shadow-none text-muted-foreground",
              position === "start" ? "rounded-l-[min(var(--radius-md),10px)]" : "",
              position === "end" ? "rounded-r-[min(var(--radius-md),10px)]" : "",
              "hover:bg-muted hover:text-foreground"
            ].join(" ")
      }
    >
      {children}
    </Button>
  );
}
