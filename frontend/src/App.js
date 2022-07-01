/* globals zoomSdk */
import { useLocation, useHistory } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import Button from "react-bootstrap/Button";

import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";

import { RECORDING_ACTION, MOMENT_ACTION, getTimestamp } from './util'
import Clock from "./components/Clock";

let once = 0; // to prevent increasing number of event listeners being added
function App() {
  const history = useHistory();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [info, setInfo] = useState({})
  const [userAuthorized, setUserAuthorized] = useState(null);
  const [showInClientOAuthPrompt, setShowInClientOAuthPrompt] = useState(false);
  const [runningContext, setRunningContext] = useState(null);
  const [connected, setConnected] = useState(false);
  const [counter, setCounter] = useState(0);
  const [preMeeting, setPreMeeting] = useState(true); // start with pre-meeting code
  const [inGuestMode, setInGuestMode] = useState(false);
  const [userContextStatus, setUserContextStatus] = useState("");
  const [meetingContext, setMeetingContext] = useState(null)
  const [recordingContext, setRecordingContext] = useState()
  const [curMoment, setCurMoment] = useState({ action: MOMENT_ACTION.STANDBY })
  const [momentData, setMomentData] = useState({})
  const [userContext, setUserContext] = useState()

  const beforeRecording = meetingContext?.meetingID && (!recordingContext || recordingContext?.action === RECORDING_ACTION.STOPPED || recordingContext?.action === RECORDING_ACTION.PAUSED)
  const recordingStarted = recordingContext?.action === RECORDING_ACTION.STARTED
  const recordingStopped = recordingContext?.action === RECORDING_ACTION.STOPPED
  const recordingPaused = recordingContext?.action === RECORDING_ACTION.PAUSED
  const beforeStartMoment = recordingStarted && curMoment?.action === MOMENT_ACTION.STANDBY
  const momentStarted = recordingStarted && curMoment?.action === MOMENT_ACTION.STARTED
  const momentEnded = (recordingStarted || recordingStopped || recordingPaused) && curMoment?.action === MOMENT_ACTION.ENDED
  const momentSaved = curMoment?.action === MOMENT_ACTION.SAVED

  const getMeetingContext = useCallback(() => {
    zoomSdk
      .getMeetingContext()
      .then((ctx) => {
        console.log("Meeting Context", ctx);
        setMeetingContext({
          ...ctx,
          startTime: getTimestamp()
        })
      })
      .catch((e) => {
        console.log(e);
      });
  }, []);

  const getRecordingContext = useCallback(() => {
    zoomSdk
      .getRecordingContext()
      .then((ctx) => {
        console.log("Recording Context", ctx);
        setRecordingContext({
          action: ctx.cloudRecordingStatus
        })
      })
      .catch((e) => {
        console.log(e);
      });
  }, []);

  const getUserContext = useCallback(() => {
    zoomSdk
      .getUserContext()
      .then((ctx) => {
        console.log("User Context", ctx);
        setUserContext(ctx)
      })
      .catch((e) => {
        console.log(e);
        setInfo(e)
      });
  }, []);

  const sendToOx = () => {
    momentData.meeting = meetingContext
    momentData.user = {
      email: user.email,
      account_id: user.account_id
    }
    if (!momentData.moments) {
      momentData.moments = []
    }
    if (curMoment.action !== MOMENT_ACTION.STANDBY) {
      let _curMoment = {
        ...curMoment,
        action: MOMENT_ACTION.SAVED,
      }
      if (curMoment.action === MOMENT_ACTION.STARTED) {
        _curMoment = {
          ..._curMoment,
          endAt: getTimestamp()
        }
      }
      momentData.moments.push(_curMoment)
      setCurMoment({
        action: MOMENT_ACTION.STANDBY
      })
    }
    setMomentData(momentData)
  }

  useEffect(() => {
    if (!user) return

    if ((recordingContext?.action === RECORDING_ACTION.STOPPED || recordingContext?.action === RECORDING_ACTION.PAUSED) && !beforeStartMoment && !momentSaved) {
      sendToOx()
    }

    if (recordingContext?.action === RECORDING_ACTION.STOPPED) {
      fetch("/api/zoomapp/recording-ended", {
        method: "POST",
        body: JSON.stringify(momentData),
        headers: {
          "Content-Type": "application/json",
        },
      }).then(() => {
        console.log(
          "momentData successfully store on the redis store in the backend. just waiting until the recordings available on the cloud"
        );
        setMomentData({})
        // the error === string
        setError(null);
      });
    }
  }, [recordingContext, recordingContext?.action])

  const controlCloudRecording = (_action = "start") => {
    console.log('startCloudRecording')
    setInfo({ info: "startCloudRecording" })
    if (recordingContext.action === RECORDING_ACTION.PAUSED) {
      _action = "resume"
    }
    zoomSdk.cloudRecording({ action: _action })
      .then((ctx) => {
        console.log(ctx);
      })
      .catch((e) => {
        console.log(e);
        setInfo(e)
      });
  };

  useEffect(() => {
    // this is not the best way to make sure > 1 instances are not registered
    zoomSdk.onCloudRecording((event) => {
      setRecordingContext({
        ...event,
      })
    })
  }, [])

  useEffect(() => {
    zoomSdk.onMeeting((event) => {
      setMeetingContext(event)
    });
  }, [])

  const promptAuthorize = async () => {
    await zoomSdk
      .promptAuthorize()
      .then((res) => console.log(res))
      .catch((err) => console.log(err));
  };

  const authorize = async () => {
    setShowInClientOAuthPrompt(false);
    console.log("Authorize flow begins here");
    console.log("1. Get code challenge and state from backend . . .");
    const resp = await fetch("/api/zoomapp/authorize")
      .then((r) => r.json())
      .catch((e) => {
        console.log(e);
      });

    if (!resp || !resp.codeChallenge) {
      console.log(
        "Error in the authorize flow - likely an outdated user session.  Please refresh the app"
      );
      setShowInClientOAuthPrompt(true);
      return;
    }

    const { codeChallenge, state } = resp;

    console.log("1a. Code challenge from backend: ", codeChallenge);
    console.log("1b. State from backend: ", state);

    const authorizeOptions = {
      codeChallenge: codeChallenge,
      state: state,
    };

    console.log(
      '2. Invoke authorize, eg zoomSdk.callZoomApi("authorize", authorizeOptions)'
    );
    setInfo(authorizeOptions)
    zoomSdk
      .callZoomApi("authorize", authorizeOptions)
      .then((response) => {
        console.log(response);
      })
      .catch((e) => {
        console.log(e);
      });
  };

  useEffect(() => {
    // this is not the best way to make sure > 1 instances are not registered
    console.log("In-Client OAuth flow: onAuthorized event listener added");
    zoomSdk.addEventListener("onAuthorized", (event) => {
      const { code, state } = event;
      console.log("3. onAuthorized event fired.");
      console.log(
        "3a. Here is the event passed to event listener callback, with code and state: ",
        event
      );
      console.log(
        "4. POST the code, state to backend to exchange server-side for a token.  Refer to backend logs now . . ."
      );

      fetch("/api/zoomapp/onauthorized", {
        method: "POST",
        body: JSON.stringify({
          code,
          state,
          href: window.location.href,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }).then(() => {
        console.log(
          "4. Backend returns succesfully after exchanging code for auth token.  Go ahead and update the UI"
        );
        setUserAuthorized(true);

        // the error === string
        setError(null);
      });
    });
  }, []);

  useEffect(() => {
    zoomSdk.addEventListener("onMyUserContextChange", (event) => {
      setInfo(event)
      setUserContextStatus(event.status);
    });
    async function fetchUser() {
      try {
        // An example of using the Zoom REST API via proxy
        const response = await fetch("/zoom/api/v2/users/me");
        if (response.status !== 200) throw new Error();
        const user = await response.json();
        setUser(user);
        setShowInClientOAuthPrompt(false);
      } catch (error) {
        console.log(error);
        console.log(
          "Request to Zoom REST API has failed ^, likely because no Zoom access token exists for this user. You must use the authorize API to get an access token"
        );
        setShowInClientOAuthPrompt(true);
        // setError("There was an error getting your user information");
      }
    }

    if (userContextStatus === "authorized") {
      setInGuestMode(false);
      fetchUser();
    } else if (
      userContextStatus === "unauthenticated" ||
      userContextStatus === "authenticated"
    ) {
      setInGuestMode(true);
    }
  }, [userAuthorized, userContextStatus]);

  const showNotification = useCallback(() => {
    console.log('==showNotification===');
    async function showNotification() {
      try {
        await zoomSdk.showNotification({
          type: "info",
          title: "Hello Zoom Apps",
          message: "Testing notification",
        });
      } catch (error) {
        console.error(error);
        setError("There was an error showing the notification");
      }
    }
    showNotification();
  }, []);

  const sendAppInvitationToAll = useCallback(() => {
    async function sendAppInvitationToAll() {
      try {
        if (runningContext !== "inMeeting") {
          console.error("Must be in meeting to send app invitation");
        }
        const meetingParticipants = await zoomSdk.callZoomApi(
          "getMeetingParticipants"
        );
        console.log("meetingparts", meetingParticipants);
        let participantChunk = [];
        for (let i = 0; i < meetingParticipants.participants.length; i += 10) {
          let j = i;
          participantChunk = meetingParticipants.participants.slice(
            i,
            (j += 10)
          );
          const invitation = await zoomSdk.callZoomApi("sendAppInvitation", {
            user_list: getParticipantIds(participantChunk),
          });
          console.log("AppInvitationtoAll", invitation);
        }
      } catch (e) {
        console.error(e);
      }
    }
    sendAppInvitationToAll();
  }, [runningContext]);

  useEffect(() => {
    async function configureSdk() {
      // to account for the 2 hour timeout for config
      const configTimer = setTimeout(() => {
        setCounter(counter + 1);
      }, 120 * 60 * 1000);

      try {
        // Configure the JS SDK, required to call JS APIs in the Zoom App
        // These items must be selected in the Features -> Zoom App SDK -> Add APIs tool in Marketplace
        const configResponse = await zoomSdk.config({
          capabilities: [
            "getMeetingContext",
            "getRunningContext",
            "getSupportedJsApis",
            "onSendAppInvitation",
            "onShareApp",
            "cloudRecording",
            "onCloudRecording",
            "showNotification",
            "removeVirtualBackground",
            "sendAppInvitation",
            "getMeetingParticipants",
            "connect",
            "onConnect",
            "onMeeting",
            "postMessage",
            "onMessage",
            "onActiveSpeakerChange",
            "authorize",
            "onAuthorized",
            "promptAuthorize",
            "getUserContext",
            "onMyUserContextChange",
          ],
          version: '0.16.0'
        });
        console.log("App configured", configResponse);
        // The config method returns the running context of the Zoom App
        setRunningContext(configResponse.runningContext);
        setUserContextStatus(configResponse.auth.status);
        zoomSdk.onSendAppInvitation((data) => {
          console.log(data);
        });
        zoomSdk.onShareApp((data) => {
          console.log(data);
        });
      } catch (error) {
        console.log(error);
        setError("There was an error configuring the JS SDK");
      }

      getMeetingContext()
      getRecordingContext()
      getUserContext()
      return () => {
        clearTimeout(configTimer);
      };
    }
    configureSdk();
  }, [counter]);

  // PRE-MEETING
  let on_message_handler_client = useCallback(
    (message) => {
      let content = message.payload.payload;
      if (content === "connected" && preMeeting === true) {
        console.log("Meeting instance exists.");
        zoomSdk.removeEventListener("onMessage", on_message_handler_client);
        console.log("Letting meeting instance know client's current state.");
        sendMessage(window.location.hash, "client");
        setPreMeeting(false); // client instance is finished with pre-meeting
      }
    },
    [preMeeting]
  );

  // PRE-MEETING
  useEffect(() => {
    if (runningContext === "inMainClient" && preMeeting === true) {
      zoomSdk.addEventListener("onMessage", on_message_handler_client);
    }
  }, [on_message_handler_client, preMeeting, runningContext]);

  async function sendMessage(msg, sender) {
    console.log(
      "Message sent from " + sender + " with data: " + JSON.stringify(msg)
    );
    console.log("Calling postmessage...", msg);
    await zoomSdk.callZoomApi("postMessage", {
      payload: msg,
    });
  }

  const receiveMessage = useCallback(
    (receiver, reason = "") => {
      let on_message_handler = (message) => {
        let content = message.payload.payload;
        console.log(
          "Message received " + receiver + " " + reason + ": " + content
        );
        history.push({ pathname: content });
      };
      if (once === 0) {
        zoomSdk.addEventListener("onMessage", on_message_handler);
        once = 1;
      }
    },
    [history]
  );

  useEffect(() => {
    async function connectInstances() {
      // only can call connect when in-meeting
      if (runningContext === "inMeeting") {
        zoomSdk.addEventListener("onConnect", (event) => {
          console.log("Connected");
          setConnected(true);

          // PRE-MEETING
          // first message to send after connecting instances is for the meeting
          // instance to catch up with the client instance
          if (preMeeting === true) {
            console.log("Letting client know meeting instance exists.");
            sendMessage("connected", "meeting");
            console.log("Adding message listener for client's current state.");
            let on_message_handler_mtg = (message) => {
              console.log(
                "Message from client received. Meeting instance updating its state:",
                message.payload.payload
              );
              window.location.replace(message.payload.payload);
              zoomSdk.removeEventListener("onMessage", on_message_handler_mtg);
              setPreMeeting(false); // meeting instance is finished with pre-meeting
            };
            zoomSdk.addEventListener("onMessage", on_message_handler_mtg);
          }
        });

        await zoomSdk.callZoomApi("connect");
        console.log("Connecting...");
      }
    }

    if (connected === false) {
      console.log(runningContext, location.pathname);
      connectInstances();
    }
  }, [connected, location.pathname, preMeeting, runningContext]);

  // POST-MEETING
  useEffect(() => {
    async function communicateTabChange() {
      // only proceed with post-meeting after pre-meeting is done
      // just one-way communication from in-meeting to client
      if (runningContext === "inMeeting" && connected && preMeeting === false) {
        sendMessage(location.pathname, runningContext);
      } else if (runningContext === "inMainClient" && preMeeting === false) {
        receiveMessage(runningContext, "for tab change");
      } else {
        console.log("Error trying to communicate tab change");
      }
    }
    communicateTabChange();
  }, [connected, location, preMeeting, receiveMessage, runningContext]);

  if (error) {
    console.log(error);
    return (
      <div className="App">
        <h1>{error.message}</h1>
      </div>
    );
  }

  const momentBlock = (
    <>
      {
        beforeStartMoment && "save a moment"
      }
      {
        momentStarted && "recording moment..."
      }
      {
        momentEnded && "moment saved"
      }
    </>
  )

  const startMoment = () => {
    setCurMoment({
      name: "My saved moment",
      action: MOMENT_ACTION.STARTED,
      startAt: getTimestamp()
    })
  };

  const endMoment = () => {
    setCurMoment({
      ...curMoment,
      name: "My saved moment",
      action: MOMENT_ACTION.ENDED,
      endAt: getTimestamp()
    })
  }

  const handleChangeName = (e) => {
    setCurMoment({
      ...curMoment,
      name: e.target.value
    })
  }

  if (!runningContext) {
    return (
      <div className="App">
        <div className="label">
          Please wait for a while
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="App">
        <div className="label">
          Please install the app first
        </div>

        <Button variant="outline-primary" onClick={authorize}> authorize</Button>
      </div>
    )
  }

  return (
    <div className="App">
      <div className="label">
        {(beforeRecording || momentSaved) && "start Zoom recording"}

        {momentBlock}

        {!meetingContext?.meetingID && "Meeting is not started yet..."}
      </div>
      <div className="count">
        {(momentStarted) && <Clock />}
      </div>
      <div className="button-block">
        {(beforeRecording || momentSaved) && <Button variant="outline-primary" onClick={() => controlCloudRecording()} disabled={meetingContext?.meetingID === undefined} size="lg">
          start
        </Button>
        }

        {beforeStartMoment && <Button variant="outline-success" onClick={startMoment} disabled={meetingContext?.meetingID === undefined} size="lg">
          start moment
        </Button>}

        {momentStarted && <Button variant="outline-danger" onClick={endMoment} disabled={meetingContext?.meetingID === undefined} size="lg">
          end moment
        </Button>}


        {
          momentEnded && (
            <div className="save-block">
              <input
                type="text"
                placeholder="Enter Saved Moment"
                value={curMoment.name}
                onChange={handleChangeName}
              />
              <div>
                <Button variant="success" onClick={sendToOx} size="lg" disabled={!curMoment?.name}>
                  send to Ox
                </Button>
              </div>
            </div>
          )
        }

      </div>
      <div className="bottom-block button-block">
        {(recordingStarted || recordingPaused) && <Button variant="link" onClick={() => controlCloudRecording("stop")}>end Zoom recording</Button>}
      </div>
      {/* <p>recordingContext {JSON.stringify(meetingContext)}</p>
      <p>momentData {JSON.stringify(momentData)}</p> */}
    </div>
  );
}

//helper function to extract the participantIDs from participant data
function getParticipantIds(ptx) {
  const participantIds = ptx.map((element) => element.participantId);
  return participantIds;
}

export default App;
