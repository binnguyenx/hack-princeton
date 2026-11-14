export interface RunningContractBackend {
  readonly baseUrl: string
  readonly storageRoot: string
  restart(): Promise<void>
  close(): Promise<void>
}

export type ContractBackendFactory = () => Promise<RunningContractBackend>
