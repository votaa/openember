import {COPILOT_RULES} from '../src/data/copilotPrompt.js'
import { POLICY,inputEstimate } from './copilot-contract.js'
import {createContextTools} from './copilot-context-core.js'
export const {needs,sourceNeeded,scopeKey,conversation,retrieve,buildLocalContext,canonical}=createContextTools(POLICY,inputEstimate,COPILOT_RULES)
