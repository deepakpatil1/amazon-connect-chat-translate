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

  async function processChatText(content, type, contactId) {
    let textLang = '';
    for (let i = 0; i < languageTranslate.length; i++) {
      if (languageTranslate[i].contactId === contactId) {
        textLang = languageTranslate[i].lang;
        break;
      }
    }

    if (!textLang) {
      const tempLang = await detectText(content);
      textLang = tempLang.textInterpretation.language;
    }

    const upsert = (array, item) => {
      const i = array.findIndex(_item => _item.contactId === item.contactId);
      if (i > -1) array[i] = item;
      else array.push(item);
    };

    upsert(languageTranslate, { contactId, lang: textLang });
    setLanguageTranslate(languageTranslate);

    const translatedMessage = await translateText(content, textLang, 'en');
    const data2 = {
      contactId,
      username: 'customer',
      content: <p>{content}</p>,
      translatedMessage: <p>{translatedMessage}</p>
    };
    addChat(prevMsg => [...prevMsg, data2]);
  }

  function getEvents(contact, agentChatSession) {
    contact.getAgentConnection().getMediaController().then(controller => {
      controller.onMessage(messageData => {
        if (messageData.chatDetails.participantId === messageData.data.ParticipantId) {
          console.log(`Agent ${messageData.data.DisplayName} says:`, messageData.data.Content);
        } else {
          console.log(`Customer ${messageData.data.DisplayName} says:`, messageData.data.Content);
          processChatText(messageData.data.Content, messageData.data.Type, messageData.data.ContactId);
        }
      });
    });
  }

  function subscribeConnectEvents(retry = 0) {
    if (!window.connect) {
      if (retry < 10) {
        console.warn('connect not ready, retrying...');
        setTimeout(() => subscribeConnectEvents(retry + 1), 1000);
      } else {
        console.error('Amazon Connect not available after retries.');
      }
      return;
    }

    // Safe usage of onViewContact
    if (window.connect.core?.onViewContact) {
      try {
        window.connect.core.onViewContact(event => {
          console.log("onViewContact", event.contactId);
          setCurrentContactId(event.contactId);
        });
      } catch (err) {
        console.warn('Failed onViewContact:', err);
      }
    }

    // Agent event binding
    if (typeof window.connect.agent === 'function') {
      try {
        window.connect.agent(agent => {
          if (agent?.onStateChange) {
            agent.onStateChange(stateChange => {
              console.log("Agent state changed:", stateChange.newState);
            });
          }
        });
      } catch (err) {
        console.warn('Failed agent binding:', err);
      }
    }

    // Contact event binding
    if (typeof window.connect.contact === 'function') {
      try {
        window.connect.contact(contact => {
          contact.onConnecting(() => {
            console.log("onConnecting >>", contact.contactId);
          });

          contact.onAccepted(async () => {
            const cnn = contact.getConnections().find(c => c.getType() === window.connect.ConnectionType.AGENT);
            const agentChatSession = await cnn.getMediaController();
            setCurrentContactId(contact.contactId);
            setAgentChatSessionState(prev => [...prev, { [contact.contactId]: agentChatSession }]);

            const langAttr = contact.getAttributes().x_lang?.value;
            if (langAttr && Object.values(languageOptions).includes(langAttr)) {
              languageTranslate.push({ contactId: contact.contactId, lang: langAttr });
              setLanguageTranslate(languageTranslate);
              setRefreshChild('updated');
            }
          });

          contact.onConnected(async () => {
            const cnn = contact.getConnections().find(c => c.getType() === window.connect.ConnectionType.AGENT);
            const agentChatSession = await cnn.getMediaController();
            getEvents(contact, agentChatSession);
          });

          contact.onEnded(() => {
            console.log("onEnded >>", contact.contactId);
            setLang('');
          });

          contact.onDestroy(() => {
            console.log("onDestroy >>", contact.contactId);
            setCurrentContactId('');
            clearChat();
          });
        });
      } catch (err) {
        console.warn('Failed contact binding:', err);
      }
    }
  }

  useEffect(() => {
    const inIframe = window.self !== window.top;
    setIsStandalone(!inIframe);

    if (!inIframe) {
      console.log("App running standalone → initializing CCP");
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
      console.log("App running inside iframe → skipping CCP init");
    }

    subscribeConnectEvents();
  }, []);

  return (
    <main style={{ backgroundColor: 'white', minHeight: '100vh', padding: '1rem' }}>
      <Grid columns='equal' stackable padded>
        <Grid.Row>
          {isStandalone && <div id="ccp-container"></div>}

          <div id="chatroom">
            {agentChatSessionState.length === 0 ? (
              <p style={{ color: 'black' }}>
                Waiting for contact session...
              </p>
            ) : (
              <Chatroom session={agentChatSessionState} />
            )}
          </div>
        </Grid.Row>
        {!isStandalone && (
          <Grid.Row>
            <div style={{ color: 'black' }}>
              <strong>Running inside Amazon Connect Agent Workspace</strong>
            </div>
          </Grid.Row>
        )}
      </Grid>
    </main>
  );
};

export default Ccp;
