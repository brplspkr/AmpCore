export {};

export interface RemoteAccessInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  pin: string;
  /** One remote URL per local network address, e.g. http://192.168.1.20:8787/remote */
  urls: string[];
  /** SVG markup of a QR code for each entry in `urls`. */
  qrCodes: string[];
  error: string | null;
}

declare global {
  interface Window {
    electronWindow?: {
      isDesktop: boolean;
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<"darwin" | "win32" | "linux" | string>;
      openSpeakerLibraryFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      pickSlFolder: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        error?: string;
        files?: Array<{ name: string; data: string }>;
      }>;
      minimize: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      getRemoteInfo: () => Promise<RemoteAccessInfo | null>;
      setRemoteEnabled: (enabled: boolean) => Promise<RemoteAccessInfo | null>;
      regenerateRemotePin: () => Promise<RemoteAccessInfo | null>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
  }
}
