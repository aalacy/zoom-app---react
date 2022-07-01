export const getTimestamp = () => {
    return new Date()
}

export const RECORDING_ACTION = {
    CONNECTING: "connecting",
    STARTED: "started",
    STOPPED: "stopped",
    PAUSED: "paused"
  }
  
export const MOMENT_ACTION = {
    STANDBY: "standby",
    STARTED: "started",
    ENDED: "ended",
    SAVED: "saved"
}