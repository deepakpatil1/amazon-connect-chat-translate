import React, { useEffect, useState } from 'react';
import { Grid } from 'semantic-ui-react';
import { Amplify } from 'aws-amplify';
import awsconfig from '../aws-exports';
import Chatroom from './chatroom';
import translateText from './translate';
import detectText from './detectText';
import { addChat, setLanguageTranslate, clearChat, useGlobalState, setCurrentContactId } from '../store/state';

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

  function getEvents(contact, agentChatSession) {
    contact.getAgentConnection().getMediaController().then(controller => {
      controller.onMessage(messageData => {
        if (messageData.chatDetails.participantId === messageData.data.ParticipantId) {
          console.log(`CDEBUG ===> Agent ${messageData.data.DisplayName} Says`, messageData.data.Content);
        } else {
          console.log(`CDEBUG ===> Customer ${messageData.data.DisplayName} Says`, messageData.data.Content);
          processChatText(messageData.data.Content, messageData.data.Type, messageData.data.ContactId);
        }
      });
    });
  }

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

  function subscribeConnectEvents() {
    if (!window.connect || !window.connect.contact || !window.connect.agent) {
      console.warn('connect object not ready, retrying...');
      setTimeout(subscribeConnectEvents, 1000);
      return;
    }

    window.connect.core?.onViewContact(event => {
      console.log('CDEBUG ===> onViewContact', event.contactId);
      setCurrentContactId(event.contactId);
    });

    if (window.connect.ChatSession) {
      console.log('CDEBUG ===> Subscribing to Connect Contact Events for chats');
      window.connect.contact(contact => {
        contact.onConnecting(() => {
          console.log('CDEBUG ===> onConnecting() >>', contact.contactId);
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

        contact.onRefresh(() => {
          console.log('CDEBUG ===> onRefresh >>', contact.contactId);
        });

        contact.onEnded(() => {
          console.log('CDEBUG ===> onEnded >>', contact.contactId);
          setLang('');
        });

        contact.onDestroy(() => {
          console.log('CDEBUG ===> onDestroy >>', contact.contactId);
          setCurrentContactId('');
          clearChat();
        });
      });

      window.connect.agent(agent => {
        agent.onStateChange(stateChange => {
          console.log('CDEBUG ===> Agent State:', stateChange.newState);
        });
      });
    } else {
      console.log('CDEBUG ===> ChatSession not ready, retrying...');
      setTimeout(subscribeConnectEvents, 3000);
    }
  }

  useEffect(() => {
    const inIframe = window.self !== window.top;
    setIsStandalone(!inIframe);

    if (!inIframe) {
      const connectUrl = process.env.REACT_APP_CONNECT_INSTANCE_URL;
      window.connect.agentApp.initApp(
        'ccp',
        'ccp-container',
        connectUrl + '/connect/ccp-v2/',
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
      console.log('App running inside iframe → skipping CCP init');
    }

    subscribeConnectEvents();
  }, []);

  return (
    <main>
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
