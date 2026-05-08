import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Download, ExternalLink, Loader2, QrCode, X } from 'lucide-react';
import type { MainContentHeaderProps } from '../../types/types';
import { api } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';
import MobileMenuButton from './MobileMenuButton';
import MainContentTitle from './MainContentTitle';

const DEFAULT_PUBLIC_DEPLOY_BASE_URL = 'https://auto.huibanxue.com/aisoft/deploy';

type DeploymentTarget = {
  type?: string;
  url?: string | null;
};

type DeploymentPayload = {
  success?: boolean;
  deployment?: {
    targets?: DeploymentTarget[];
    publicUrl?: string | null;
    copiedEntries?: string[];
  };
  error?: string;
};

type MiniProgramDelivery = {
  publicUrl: string;
  downloadUrl: string;
  previewQrUrl: string;
  packageName: string;
};

async function parseDeploymentResponse(response: Response): Promise<DeploymentPayload> {
  return response.json().catch(() => ({})) as Promise<DeploymentPayload>;
}

function normalizeBaseUrl(value = ''): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getPreferredDeployBaseUrl(): string {
  const configuredBaseUrl = normalizeBaseUrl(
    import.meta.env.VITE_PUBLIC_DEPLOY_BASE_URL || import.meta.env.VITE_DEPLOY_BASE_URL || '',
  );
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0';

  if (isLocalhost) {
    return DEFAULT_PUBLIC_DEPLOY_BASE_URL;
  }

  return `${normalizeBaseUrl(origin)}/aisoft/deploy`;
}

function toPublicDeployUrl(rawUrl: string): string {
  const trimmedUrl = String(rawUrl || '').trim();
  if (!trimmedUrl) {
    return '';
  }

  const preferredBaseUrl = getPreferredDeployBaseUrl();

  try {
    const parsedUrl = new URL(trimmedUrl, window.location.origin);
    const deployMatch = parsedUrl.pathname.match(/\/aisoft\/deploy\/.+$/);
    if (deployMatch) {
      return `${preferredBaseUrl}${deployMatch[0].replace('/aisoft/deploy', '')}`;
    }
  } catch {
    // Fall back to the raw URL when parsing fails.
  }

  return trimmedUrl;
}

function appendUrlPath(baseUrl: string, relativePath: string): string {
  const trimmedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const trimmedRelativePath = String(relativePath || '').trim().replace(/^[/\\]+/, '');
  if (!trimmedBaseUrl || !trimmedRelativePath) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}/${trimmedRelativePath.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/')}`;
}

function resolveMiniProgramDelivery(payload: DeploymentPayload): MiniProgramDelivery | null {
  const publicUrl = toPublicDeployUrl(payload.deployment?.publicUrl || '');
  if (!publicUrl) {
    return null;
  }

  const copiedEntries = payload.deployment?.copiedEntries || [];
  const packageName = copiedEntries.find((entry) => /\.(zip|rar|7z)$/i.test(entry))
    || copiedEntries.find((entry) => /\.(apk|ipa)$/i.test(entry))
    || 'miniprogram.zip';
  const previewQrName = copiedEntries.find((entry) => /(^|[/\\])(preview-qr|wechat-preview|qr)\.(png|jpe?g|webp)$/i.test(entry))
    || 'preview-qr.png';

  return {
    publicUrl,
    downloadUrl: appendUrlPath(publicUrl, packageName),
    previewQrUrl: appendUrlPath(publicUrl, previewQrName),
    packageName,
  };
}

function MiniProgramDeliveryModal({
  delivery,
  onClose,
}: {
  delivery: MiniProgramDelivery;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [downloadQrDataUrl, setDownloadQrDataUrl] = useState('');
  const [previewQrFailed, setPreviewQrFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(delivery.downloadUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
    }).then((dataUrl) => {
      if (!cancelled) {
        setDownloadQrDataUrl(dataUrl);
      }
    }).catch(() => {
      if (!cancelled) {
        setDownloadQrDataUrl('');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [delivery.downloadUrl]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="fixed inset-0 cursor-default"
        aria-label={t('buttons.close')}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-[720px] rounded-lg border border-border bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-program-delivery-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="mini-program-delivery-title" className="text-base font-semibold text-foreground">
              {t('mainContent.miniProgramDeliveryTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('mainContent.miniProgramDeliverySubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label={t('buttons.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 text-sm font-medium text-foreground">
              {t('mainContent.wechatPreviewQr')}
            </div>
            {!previewQrFailed ? (
              <img
                src={delivery.previewQrUrl}
                alt={t('mainContent.wechatPreviewQr')}
                className="mx-auto h-[220px] w-[220px] rounded border border-border bg-white object-contain p-2"
                onError={() => setPreviewQrFailed(true)}
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded border border-dashed border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                {t('mainContent.wechatPreviewQrMissing')}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 text-sm font-medium text-foreground">
              {t('mainContent.downloadQr')}
            </div>
            {downloadQrDataUrl ? (
              <img
                src={downloadQrDataUrl}
                alt={t('mainContent.downloadQr')}
                className="mx-auto h-[220px] w-[220px] rounded border border-border bg-white object-contain p-2"
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center rounded border border-border bg-muted/40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{delivery.packageName}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => window.open(delivery.publicUrl, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="h-4 w-4" />
              {t('mainContent.openMiniProgramFolder')}
            </Button>
            <Button type="button" size="sm" onClick={() => window.open(delivery.downloadUrl, '_blank', 'noopener,noreferrer')}>
              <Download className="h-4 w-4" />
              {t('mainContent.downloadMiniProgram')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MainContentHeader({
  activeTab,
  selectedProject,
  selectedSession,
  shouldShowTasksTab,
  isMobile,
  onMenuClick,
  showPrototypeEntry = false,
}: MainContentHeaderProps) {
  const { t } = useTranslation();
  const [isOpeningPrototype, setIsOpeningPrototype] = useState(false);
  const [isOpeningMiniProgram, setIsOpeningMiniProgram] = useState(false);
  const [miniProgramDelivery, setMiniProgramDelivery] = useState<MiniProgramDelivery | null>(null);

  const handleOpenPrototype = async () => {
    if (!selectedProject?.name || isOpeningPrototype) {
      return;
    }

    setIsOpeningPrototype(true);

    try {
      const syncCandidates = ['prototype'];
      let prototypeUrl = '';
      let lastErrorMessage = '';

      for (const sourcePath of syncCandidates) {
        const response = await api.syncProjectDeployment(selectedProject.name, {
          artifactType: 'prototype',
          sourcePath,
          clearTarget: true,
        });
        const payload = await parseDeploymentResponse(response);

        if (response.ok) {
          prototypeUrl = payload.deployment?.publicUrl || '';
          break;
        }

        lastErrorMessage = payload.error || lastErrorMessage;
      }

      if (!prototypeUrl) {
        const response = await api.getProjectDeployment(selectedProject.name);
        const payload = await parseDeploymentResponse(response);

        if (!response.ok) {
          throw new Error(payload.error || t('mainContent.prototypeOpenFailed'));
        }

        prototypeUrl = payload.deployment?.targets?.find((target) => target.type === 'prototype')?.url || '';
      }

      if (!prototypeUrl) {
        throw new Error(lastErrorMessage || t('mainContent.prototypeNotAvailable'));
      }

      window.open(toPublicDeployUrl(prototypeUrl), '_blank', 'noopener,noreferrer');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('mainContent.prototypeOpenFailed');
      window.alert(message);
    } finally {
      setIsOpeningPrototype(false);
    }
  };

  const handleOpenMiniProgram = async () => {
    if (!selectedProject?.name || isOpeningMiniProgram) {
      return;
    }

    setIsOpeningMiniProgram(true);

    try {
      const syncCandidates = ['release/miniprogram', 'dist/miniprogram'];
      let delivery: MiniProgramDelivery | null = null;
      let lastErrorMessage = '';

      for (const sourcePath of syncCandidates) {
        const response = await api.syncProjectDeployment(selectedProject.name, {
          artifactType: 'mini-program',
          sourcePath,
          clearTarget: true,
        });
        const payload = await parseDeploymentResponse(response);

        if (response.ok) {
          delivery = resolveMiniProgramDelivery(payload);
          break;
        }

        lastErrorMessage = payload.error || lastErrorMessage;
      }

      if (!delivery) {
        const response = await api.getProjectDeployment(selectedProject.name);
        const payload = await parseDeploymentResponse(response);

        if (!response.ok) {
          throw new Error(payload.error || t('mainContent.miniProgramOpenFailed'));
        }

        const publicUrl = payload.deployment?.targets?.find((target) => target.type === 'mini-program')?.url || '';
        delivery = resolveMiniProgramDelivery({
          deployment: {
            publicUrl,
          },
        });
      }

      if (!delivery) {
        throw new Error(lastErrorMessage || t('mainContent.miniProgramNotAvailable'));
      }

      setMiniProgramDelivery(delivery);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('mainContent.miniProgramOpenFailed');
      window.alert(message);
    } finally {
      setIsOpeningMiniProgram(false);
    }
  };

  return (
    <>
      <div className="pwa-header-safe flex-shrink-0 border-b border-border/60 bg-background px-3 py-1.5 sm:px-4 sm:py-2">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {isMobile && <MobileMenuButton onMenuClick={onMenuClick} />}
            <MainContentTitle
              activeTab={activeTab}
              selectedProject={selectedProject}
              selectedSession={selectedSession}
              shouldShowTasksTab={shouldShowTasksTab}
            />
          </div>

          {showPrototypeEntry && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenMiniProgram}
                disabled={isOpeningMiniProgram}
                className="shrink-0"
                title={t('mainContent.openMiniProgramDelivery')}
              >
                {isOpeningMiniProgram ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
                <span className={isMobile ? 'hidden sm:inline' : ''}>
                  {isOpeningMiniProgram ? t('mainContent.openingMiniProgram') : t('mainContent.openMiniProgramDelivery')}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPrototype}
                disabled={isOpeningPrototype}
                className="shrink-0"
                title={t('mainContent.openPrototype')}
              >
                {isOpeningPrototype ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                <span className={isMobile ? 'hidden sm:inline' : ''}>
                  {isOpeningPrototype ? t('mainContent.openingPrototype') : t('mainContent.openPrototype')}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {miniProgramDelivery && (
        <MiniProgramDeliveryModal
          delivery={miniProgramDelivery}
          onClose={() => setMiniProgramDelivery(null)}
        />
      )}
    </>
  );
}
