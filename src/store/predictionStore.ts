// Prediction store. Orchestrates Layer 2 (db) for I/O and Layer 4 (statsStore)
// for downstream recomputation. Holds no business math — see src/engine.
//
// Layer rule: this file imports from @/db and @/types and from sibling
// stores. It does NOT call expo-sqlite or sql.js directly.

import { create } from 'zustand';

import { withTransaction } from '@/db/client';
import {
  deletePrediction,
  getPrediction,
  insertPrediction,
  listPendingPredictions,
  listResolvedPredictions,
  resolvePrediction,
} from '@/db/predictions';
import type { Category, Prediction, ResolvedStatus } from '@/types';

import { useAuthStore } from './authStore';
import { useStatsStore } from './statsStore';

interface CreatePredictionInput {
  title: string;
  category: Category;
  confidence: number; // 0–100 integer
  due_date: string;   // ISO timestamp
}

interface PredictionState {
  pending: Prediction[];
  resolved: Prediction[];
  loadPending: () => Promise<void>;
  loadResolved: () => Promise<void>;
  /**
   * Fetch a single prediction by id. Returns null when missing or when the
   * row belongs to a different user — that filter exists here (not in the L2
   * helper) so deep-linked screens never have to reach into the auth store
   * directly, and a future Supabase swap doesn't leak other users' rows.
   */
  getById: (id: string) => Promise<Prediction | null>;
  create: (input: CreatePredictionInput) => Promise<Prediction>;
  resolve: (
    id: string,
    outcome: ResolvedStatus,
    reflection?: string,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Unique-enough ID for the local single-user MVP. Format: `<ts>-<rand>` in
 * base36. NOT a UUID — when L5 turns on Supabase sync, swap this for a real
 * UUID (expo-crypto's randomUUID or similar) so cross-device IDs can't
 * collide. The L2 schema already accepts any TEXT, so the swap is local
 * to this function.
 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Per CLAUDE.md: confidence in [35, 65] earns the integrity bonus. */
function isIntegrityBonus(confidence: number): boolean {
  return confidence >= 35 && confidence <= 65;
}

function requireUserId(): string {
  const { userId } = useAuthStore.getState();
  if (!userId) {
    throw new Error(
      'No active user — call useAuthStore.getState().initialize() first',
    );
  }
  return userId;
}

export const usePredictionStore = create<PredictionState>((set, get) => ({
  pending: [],
  resolved: [],

  loadPending: async () => {
    const userId = requireUserId();
    set({ pending: await listPendingPredictions(userId) });
  },

  loadResolved: async () => {
    const userId = requireUserId();
    set({ resolved: await listResolvedPredictions(userId) });
  },

  getById: async (id) => {
    const userId = requireUserId();
    const p = await getPrediction(id);
    if (!p || p.user_id !== userId) return null;
    return p;
  },

  create: async (input) => {
    const userId = requireUserId();

    // Validation — defense in depth. The DB has matching CHECK constraints,
    // but failing fast here gives the UI a clean error message.
    if (
      !Number.isInteger(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 100
    ) {
      throw new Error('confidence must be an integer between 0 and 100');
    }
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length === 0) {
      throw new Error('title is required');
    }

    const prediction: Prediction = {
      id: newId(),
      user_id: userId,
      title: trimmedTitle,
      category: input.category,
      confidence: input.confidence,
      created_at: nowIso(),
      due_date: input.due_date,
      status: 'pending',
      resolved_at: null,
      reflection: null,
      integrity_bonus: isIntegrityBonus(input.confidence),
    };
    // Atomic: insert + stats recompute go together so total_predictions and
    // per-category predictions_made never lag behind the prediction list.
    await withTransaction(async () => {
      await insertPrediction(prediction);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    // Reload instead of appending: the DB query sorts by due_date, and the
    // newly-inserted row may belong before existing entries.
    await get().loadPending();
    return prediction;
  },

  resolve: async (id, outcome, reflection) => {
    const userId = requireUserId();
    // Atomic: if stats recompute throws, the resolution rolls back too.
    await withTransaction(async () => {
      await resolvePrediction(id, outcome, reflection);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    // Refresh local lists from the source of truth.
    await Promise.all([get().loadPending(), get().loadResolved()]);
  },

  remove: async (id) => {
    const userId = requireUserId();
    // Deleting a resolved prediction changes calibration, streak, and per-
    // category counts — recompute inside the same transaction so the stats
    // never reflect a ghost prediction.
    await withTransaction(async () => {
      await deletePrediction(id);
      await useStatsStore.getState().recomputeForUser(userId);
    });
    await Promise.all([get().loadPending(), get().loadResolved()]);
  },
}));
