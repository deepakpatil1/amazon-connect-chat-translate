import React, { useEffect, useState } from 'react';
import { Grid } from 'semantic-ui-react';
import { Amplify } from 'aws-amplify';
import awsconfig from '../aws-exports';
import Chatroom from './chatroom';
import {
  useGlobalState,
  setCurrentContactId
} from '../store/state';

Amplify.configure(awsconfig);

const Ccp = () => {
  const [currentContactId] = useGlobalState('currentContactId');
  const [agentChatSessionState, setAgentChatSessionState] = useState([]);
  const [isStandalone, setIsStandalone] = useState(true);

  // Used only in standalone mode
  const subscribeConnectEvents = () => {
    if (!window.connect?.contact) {
      console.warn("Streams API not ready");
      return;
    }

    window.connect.contact(contact => {
      contact.onAccepted(async () => {
        console.log("📞 Contact accepted:", contact.contactId);
        setCurrentContactId(contact.contactId);

        const cnn = contact.getConnections().find(c => c.getType() === window.connect.ConnectionType.AGENT);
        const session = await cnn.getMediaController();

        setAgentChatSessionState(prev => [...prev, { [contact.contactId]: session }]);
      });

      contact.onDestroy(() => {
        console.log("🛑 Contact destroyed:", contact.contactId);
        setAgentChatSessionState([]);
      });
    });
  };

  useEffect(() => {
    const inIframe = window.self !== window.top;
    setIsStandalone(!inIframe);

    if (inIframe) {
      console.log("🟡 App running inside Amazon Connect Agent Workspace");

      const urlParams = new URLSearchParams(window.location.search);
      const contactId = urlParams.get('contactId');

      if (contactId) {
        setCurrentContactId(contactId);
        console.log("✅ contactId set from query:", contactId);
      }
    } else {
      console.log("🟢 App running standalone → initializing CCP");

      const connectUrl = process.env.REACT_APP_CONNECT_INSTANCE_URL;
      window.connect.agentApp.initApp(
        "ccp",
        "ccp-container",
        connectUrl + "/connect/ccp-v2/",
        {
          ccpParams: {
            region: process.env.REACT_APP_CONNECT_REGION,
            pageOptions: {
              enableAudioDeviceSettings: true,
              enablePhoneTypeSettings: true
            }
          }
        }
      );

      subscribeConnectEvents();
    }
  }, []);

  return (
    <main style={{ backgroundColor: 'white', minHeight: '100vh', padding: '1rem' }}>
      <Grid columns='equal' stackable padded>
        <Grid.Row>
          {isStandalone && <div id="ccp-container"></div>}

          <div id="chatroom">
            <Chatroom session={agentChatSessionState} />
          </div>
        </Grid.Row>
      </Grid>
    </main>
  );
};

export default Ccp;
