import { defineQuery, defineSignal, defineUpdate } from '@temporalio/workflow';
import type { Command, Result, SalonState } from './types';
export const salonCommand = defineUpdate<Result, [Command]>('salonCommand');
export const salonSnapshot = defineQuery<SalonState>('salonSnapshot');
export const offerChanged = defineSignal('offerChanged');
