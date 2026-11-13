import schema from '../../shared/copilot/contract.schema.json'
import policy from '../../shared/copilot/policy.json'
import { createContract } from '../../lib/copilot-contract-core.js'
import { createPlanner } from '../../lib/copilot-intent-core.js'
import {createContextTools} from '../../lib/copilot-context-core.js'
import { createAdapters } from '../../lib/copilot-evidence-core.js'
export const { validateContract, inputEstimate } = createContract(schema, policy)
export const planRequest = createPlanner(policy, validateContract)
export const adaptEvidence = createAdapters(validateContract)

export const contextPolicy=policy
export const {needs:contextNeeds,sourceNeeded}=createContextTools(policy,inputEstimate)
