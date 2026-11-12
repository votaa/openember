import { validateContract } from './copilot-contract.js'
import { createAdapters } from './copilot-evidence-core.js'
export const adaptEvidence = createAdapters(validateContract)
