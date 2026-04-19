import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../../shared/view/ui';
import type { Project } from '../../types/app';
import { createWorkspaceRequest } from './data/workspaceApi';

type ProjectCreationWizardProps = {
  onClose: () => void;
  onProjectCreated?: (project?: Record<string, unknown>) => void;
  existingProjects?: Project[];
};

function normalizeProjectName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export default function ProjectCreationWizard({
  onClose,
  onProjectCreated,
  existingProjects = [],
}: ProjectCreationWizardProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const normalizedExistingNames = useMemo(
    () => new Set(
      existingProjects.flatMap((project) => {
        const names = [project.displayName, project.name]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map(normalizeProjectName);
        return names;
      }),
    ),
    [existingProjects],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const handleCreate = async () => {
    const trimmedProjectName = projectName.trim();

    if (!trimmedProjectName) {
      setError(t('projectWizard.errors.provideProjectName'));
      return;
    }

    if (normalizedExistingNames.has(normalizeProjectName(trimmedProjectName))) {
      setError(t('projectWizard.errors.duplicateProjectName'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const project = await createWorkspaceRequest({
        workspaceType: 'existing',
        name: trimmedProjectName,
      });

      onProjectCreated?.(project);
      onClose();
    } catch (createError) {
      const errorMessage =
        createError instanceof Error
          ? createError.message
          : t('projectWizard.errors.failedToCreate');
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderPlus className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {t('projectWizard.simple.title')}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={isCreating}
            aria-label={t('buttons.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              {t('projectWizard.simple.projectName')}
            </label>
            <Input
              ref={inputRef}
              type="text"
              value={projectName}
              onChange={(event) => {
                setProjectName(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder={t('projectWizard.simple.placeholder')}
              disabled={isCreating}
              maxLength={120}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t('projectWizard.simple.help')}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-border bg-muted/20 px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isCreating}>
            {t('buttons.cancel')}
          </Button>
          <Button className="flex-1" onClick={() => void handleCreate()} disabled={isCreating}>
            {isCreating ? t('projectWizard.simple.creating') : t('buttons.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
