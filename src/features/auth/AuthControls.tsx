import type { User } from '@supabase/supabase-js';
import type { CloudScoreSummary } from '../cloud/supabaseScoreRepository';

interface AuthControlsProps {
  cloudScores: readonly CloudScoreSummary[];
  cloudStatusLabel: string;
  isConfigured: boolean;
  isLoadingCloudScores: boolean;
  onAuthOpen: () => void;
  onCloudScoreLoad: (cloudScoreId: string) => void;
  onCloudScoresRefresh: () => void;
  onSignOut: () => void;
  user: User | null;
}

function getUserLabel(user: User) {
  return user.email ?? user.id.slice(0, 8);
}

export function AuthControls({
  cloudScores,
  cloudStatusLabel,
  isConfigured,
  isLoadingCloudScores,
  onAuthOpen,
  onCloudScoreLoad,
  onCloudScoresRefresh,
  onSignOut,
  user,
}: AuthControlsProps) {
  if (!isConfigured) {
    return (
      <div className="auth-controls" aria-label="Cloud account">
        <span className="auth-pill">Cloud off</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-controls" aria-label="Cloud account">
        <span className="auth-pill">{cloudStatusLabel}</span>
        <button type="button" className="tool-button" onClick={onAuthOpen}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="auth-controls" aria-label="Cloud account">
      <span className="auth-pill" title={getUserLabel(user)}>
        {cloudStatusLabel}
      </span>
      <select
        aria-label="Load cloud score"
        className="cloud-score-select"
        disabled={cloudScores.length === 0 || isLoadingCloudScores}
        defaultValue=""
        onChange={(event) => {
          const cloudScoreId = event.target.value;

          if (cloudScoreId) {
            onCloudScoreLoad(cloudScoreId);
            event.currentTarget.value = '';
          }
        }}
      >
        <option value="">
          {cloudScores.length === 0 ? 'No cloud scores' : 'Cloud scores'}
        </option>
        {cloudScores.map((record) => (
          <option key={record.id} value={record.id}>
            {record.title} - {record.measureCount} bars
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="Refresh cloud scores"
        className="tool-button"
        disabled={isLoadingCloudScores}
        onClick={onCloudScoresRefresh}
      >
        Sync
      </button>
      <button type="button" className="tool-button" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
