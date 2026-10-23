"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Copy, RefreshCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/layout/i18n-provider";
import type { RemoteAccessInfo } from "@/electron-window";

const INFO_REFRESH_MS = 3000;

const noopSubscribe = () => () => {};
const isRemoteAvailable = () => typeof window.electronWindow?.getRemoteInfo === "function";

/** Header button + dialog showing the phone remote address, QR code and PIN. Desktop app only. */
export function PhoneRemoteButton() {
  const dict = useI18n().dialogs.phoneRemote;
  // false during server render; true in the desktop app once hydrated.
  const available = useSyncExternalStore(noopSubscribe, isRemoteAvailable, () => false);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<RemoteAccessInfo | null>(null);
  const [qrSvg, setQrSvg] = useState("");

  const refresh = useCallback(async () => {
    const next = await window.electronWindow?.getRemoteInfo();
    if (next) setInfo(next);
  }, []);

  // Network addresses change when Wi-Fi switches; keep the dialog current while it's open.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void refresh(), INFO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  const primaryUrl = info?.urls[0];

  useEffect(() => {
    if (!primaryUrl) return;
    let cancelled = false;
    QRCode.toString(primaryUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => setQrSvg(""));
    return () => {
      cancelled = true;
    };
  }, [primaryUrl]);

  if (!available) return null;

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(dict.copied);
    } catch {
      // Clipboard can be unavailable; the address is visible on screen anyway.
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
        aria-label={dict.title}
        title={dict.title}
      >
        <Smartphone />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dict.title}</DialogTitle>
            <DialogDescription>{dict.description}</DialogDescription>
          </DialogHeader>

          {info && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="phone-remote-enabled"
                  checked={info.enabled}
                  onCheckedChange={async (checked) => {
                    const next = await window.electronWindow?.setRemoteEnabled(checked === true);
                    if (next) setInfo(next);
                  }}
                />
                <Label htmlFor="phone-remote-enabled">{dict.enabled}</Label>
              </div>

              {info.enabled && info.error && <p className="text-sm text-destructive">{info.error}</p>}

              {info.enabled && !info.error && !primaryUrl && (
                <p className="text-sm text-muted-foreground">{dict.noNetwork}</p>
              )}

              {info.enabled && !info.error && primaryUrl && (
                <>
                  <p className="text-sm text-muted-foreground">{dict.scan}</p>
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className="size-52 rounded-lg bg-white p-2 [&_svg]:size-full"
                      // SVG markup generated locally by the qrcode package from our own URL.
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                    <button
                      type="button"
                      onClick={() => void copyUrl(primaryUrl)}
                      className="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-sm hover:bg-muted"
                      title={dict.copy}
                    >
                      {primaryUrl}
                      <Copy className="size-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-xs text-muted-foreground">{dict.pin}</div>
                      <div className="font-mono text-2xl tracking-[0.3em]">{info.pin}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      title={dict.newPinHint}
                      onClick={async () => {
                        const next = await window.electronWindow?.regenerateRemotePin();
                        if (next) setInfo(next);
                      }}
                    >
                      <RefreshCw /> {dict.newPin}
                    </Button>
                  </div>

                  {info.urls.length > 1 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">{dict.otherAddresses}</summary>
                      <ul className="mt-2 flex flex-col gap-1 font-mono">
                        {info.urls.slice(1).map((url) => (
                          <li key={url}>
                            <button type="button" onClick={() => void copyUrl(url)} className="hover:underline">
                              {url}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <p className="text-xs text-muted-foreground">{dict.addToHome}</p>
                </>
              )}

              {info.enabled && !info.running && !info.error && primaryUrl && (
                <p className="text-xs text-muted-foreground">{dict.starting}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
