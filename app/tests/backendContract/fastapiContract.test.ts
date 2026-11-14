import { registerBackendContractScenarios } from './scenarios'
import { createFastApiContractBackend } from './fastapiLifecycle'

registerBackendContractScenarios('FastAPI', createFastApiContractBackend)
