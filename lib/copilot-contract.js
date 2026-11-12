import { readFileSync } from 'node:fs'
import { createContract } from './copilot-contract-core.js'
export const CONTRACT = JSON.parse(readFileSync(new URL('../shared/copilot/contract.schema.json', import.meta.url)))
export const POLICY = JSON.parse(readFileSync(new URL('../shared/copilot/policy.json', import.meta.url)))
export const { validateContract, executionMode, capabilities, inputEstimate } = createContract(CONTRACT, POLICY)
