import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { MainContentHeaderProps } from '../../types/types';
import { api } from '../../../../utils/api';
import { Button } from '../../../../shared/view/ui';
import MobileMenuButton from './MobileMenuButton';
import MainContentTitle from './MainContentTitle';

const DEFAULT_PUBLIC_DEPLOY_BASE_URL = 'https://cx.incomify.com/aisoft/deploy';

type DeploymentTarget = {
  type?: string;
  url?: string | null;
  available?: boolean;
  sourceAvailable?: boolean;
};

type DeploymentPayload = {
  success?: boolean;
  deployment?: {
    targets?: DeploymentTarget[];
    publicUrl?: string | null;
  };
  error?: string;
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

function toPublicPrototypeUrl(rawUrl: string): string {
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
  const [prototypeUrl, setPrototypeUrl] = useState('');

  useEffect(() => {
    let isActive = true;

    if (!showPrototypeEntry || !selectedProject?.name) {
      setPrototypeUrl('');
      return () => {
        isActive = false;
      };
    }

    api.getProjectDeployment(selectedProject.name)
      .then(parseDeploymentResponse)
      .then((payload) => {
        if (!isActive) {
          return;
        }

        const prototypeTarget = payload.deployment?.targets?.find((target) => target.type === 'prototype');
        const hasPrototype = Boolean(prototypeTarget?.available || prototypeTarget?.sourceAvailable);
        setPrototypeUrl(hasPrototype ? prototypeTarget?.url || '' : '');
      })
      .catch(() => {
        if (isActive) {
          setPrototypeUrl('');
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedProject?.name, showPrototypeEntry]);

  const handleOpenPrototype = async () => {
    if (!selectedProject?.name || isOpeningPrototype) {
      return;
    }

    setIsOpeningPrototype(true);

    try {
      const syncCandidates = ['prototype'];
      let nextPrototypeUrl = prototypeUrl;
      let lastErrorMessage = '';

      for (const sourcePath of syncCandidates) {
        const response = await api.syncProjectDeployment(selectedProject.name, {
          artifactType: 'prototype',
          sourcePath,
          clearTarget: true,
        });
        const payload = await parseDeploymentResponse(response);

        if (response.ok) {
          nextPrototypeUrl = payload.deployment?.publicUrl || nextPrototypeUrl;
          break;
        }

        lastErrorMessage = payload.error || lastErrorMessage;
      }

      if (!nextPrototypeUrl) {
        const response = await api.getProjectDeployment(selectedProject.name);
        const payload = await parseDeploymentResponse(response);

        if (!response.ok) {
          throw new Error(payload.error || t('mainContent.prototypeOpenFailed'));
        }

        const prototypeTarget = payload.deployment?.targets?.find((target) => target.type === 'prototype');
        const hasPrototype = Boolean(prototypeTarget?.available || prototypeTarget?.sourceAvailable);
        nextPrototypeUrl = hasPrototype ? prototypeTarget?.url || '' : '';
      }

      if (!nextPrototypeUrl) {
        throw new Error(lastErrorMessage || t('mainContent.prototypeNotAvailable'));
      }

      setPrototypeUrl(nextPrototypeUrl);
      window.open(toPublicPrototypeUrl(nextPrototypeUrl), '_blank', 'noopener,noreferrer');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('mainContent.prototypeOpenFailed');
      window.alert(message);
    } finally {
      setIsOpeningPrototype(false);
    }
  };

  return (
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

        {showPrototypeEntry && prototypeUrl ? (
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
        ) : null}
      </div>
    </div>
  );
}
