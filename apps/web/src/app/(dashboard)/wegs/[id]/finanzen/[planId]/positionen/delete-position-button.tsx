"use client";

import { useState } from "react";
import { deletePositionAction } from "./actions";

interface DeletePositionButtonProps {
  wegId: string;
  planId: string;
  positionId: string;
  kostenart: string;
}

export function DeletePositionButton({
  wegId,
  planId,
  positionId,
  kostenart,
}: DeletePositionButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Position "${kostenart}" wirklich entfernen?`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await deletePositionAction(wegId, planId, positionId);
      if (result?.error) {
        setError(result.error);
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={isDeleting}
        onClick={handleDelete}
        className="text-sm text-red-700 underline underline-offset-4 hover:text-red-800 disabled:opacity-50 dark:text-red-400"
      >
        {isDeleting ? "Wird entfernt …" : "Entfernen"}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
