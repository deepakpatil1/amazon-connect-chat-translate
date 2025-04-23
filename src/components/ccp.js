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

  const getEvents = (contact, agentChatSession) => {
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
  };

  const processChatText = async (content, type, contactId) => {
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
  };

  const subscribeConnectEvents = () => {
    if (!window.connect) return;

    if (typeof window.connect.contact === 'function') {
      window.connect.contact(contact => {
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
          setLang('');
        });

        contact.onDestroy(() => {
          setCurrentContactId('');
          clearChat();
        });
      });
    }
  };

  useEffect(() => {
    const inIframe = window.self !== window.top;
    setIsStandalone(!inIframe);

    if (inIframe) {
      console.log("🟡 Inside Agent Workspace");
      const urlParams = new URLSearchParams(window.location.search);
      const contactId = urlParams.get('contactId');
      if (contactId) {
        setCurrentContactId(contactId);
      }
    } else {
      console.log("🟢 Running standalone → initializing CCP");
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

      // Subscribe only in standalone
      subscribeConnectEvents();
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
          </Grid.Row>
        )}
      </Grid>
    </main>
  );
};

export default Ccp;
