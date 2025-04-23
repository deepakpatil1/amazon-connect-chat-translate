import React, { useEffect, useState } from 'react';
import { Grid } from 'semantic-ui-react';
import { Amplify } from 'aws-amplify';
import awsconfig from '../aws-exports';
import Chatroom from './chatroom';
import translateText from './translate';
import detectText from './detectText';
import {
  addChat,
  setLanguageTranslate,
  clearChat,
  useGlobalState,
  setCurrentContactId
} from '../store/state';

Amplify.configure(awsconfig);

const Ccp = () => {
  const [languageTranslate] = useGlobalState('languageTranslate');
  const [Chats] = useGlobalState('Chats');
  const [lang, setLang] = useState('');
  const [currentContactId] = useGlobalState('currentContactId');
  const [languageOptions] = useGlobalState('languageOptions');
  const [agentChatSessionState, setAgentChatSessionState] = useState([]);
  const [setRefreshChild] = useState([]);
  const [isStandalone, setIsStandalone] = useState(true);

  // Detect iframe mode and contact context
  useEffect(() => {
    const inIframe = window.self !== window.top;
    setIsStandalone(!inIframe);

    const urlParams = new URLSearchParams(window.location.search);
    const contactId = urlParams.get('contactId');
    const agentId = urlParams.get('agentARN');

    if (contactId) {
      console.log("🔗 Got contactId from URL:", contactId);
      setCurrentContactId(contactId);
    }

    if (!inIframe) {
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
    } else {
      console.log("🟡 App running inside iframe → skipping CCP init");
    }
  }, []);

  return (
    <main style={{ backgroundColor: 'white', minHeight: '100vh', padding: '1rem' }}>
      <Grid columns='equal' stackable padded>
        <Grid.Row>
          {isStandalone && <div id="ccp-container"></div>}

          <div id="chatroom">
            {currentContactId ? (
              <Chatroom session={agentChatSessionState} />
            ) : (
              <p style={{ color: 'black' }}>Waiting for contact session...</p>
            )}
          </div>
        </Grid.Row>

        {!isStandalone && (
          <Grid.Row>
            <div style={{ color: 'black' }}>
              <strong>Running inside Amazon Connect Agent Workspace</strong>
            </div>
            {!currentContactId && (
              <pre style={{ color: 'gray' }}>
                Debug: {window.location.search}
              </pre>
            )}
          </Grid.Row>
        )}
      </Grid>
    </main>
  );
};

export default Ccp;
