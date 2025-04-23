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
  var localLanguageTranslate = [];
  const [Chats] = useGlobalState('Chats');
  const [lang, setLang] = useState("");
  const [currentContactId] = useGlobalState('currentContactId');
  const [languageOptions] = useGlobalState('languageOptions');
  const [agentChatSessionState, setAgentChatSessionState] = useState([]);
  const [setRefreshChild] = useState([]);

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

  async function processChatText(content, type, contactId) {
    let textLang = '';
    for (let i = 0; i < languageTranslate.length; i++) {
      if (languageTranslate[i].contactId === contactId) {
        textLang = languageTranslate[i].lang;
        break;
      }
    }

    if (localLanguageTranslate.length === 0 || textLang === '') {
      let tempLang = await detectText(content);
      textLang = tempLang.textInterpretation.language;
    }

    function upsert(array, item) {
      const i = array.findIndex(_item => _item.contactId === item.contactId);
      if (i > -1) array[i] = item;
      else array.push(item);
    }

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
    if (!window.connect?.contact) {
      setTimeout(() => subscribeConnectEvents(), 3000);
      return;
    }

    window.connect.core?.onViewContact?.(event => {
      const contactId = event.contactId;
      setCurrentContactId(contactId);
    });

    if (window.connect.ChatSession) {
      window.connect.contact(contact => {
        contact.onConnecting(() => {
          const contactAttributes = contact.getAttributes();
          console.log("Attributes:", contactAttributes);
        });

        contact.onAccepted(async () => {
          const cnn = contact.getConnections().find(cnn => cnn.getType() === window.connect.ConnectionType.AGENT);
          const agentChatSession = await cnn.getMediaController();
          setCurrentContactId(contact.contactId);
          setAgentChatSessionState(prev => [...prev, { [contact.contactId]: agentChatSession }]);

          localLanguageTranslate = contact.getAttributes().x_lang?.value;
          if (languageOptions && localLanguageTranslate && Object.values(languageOptions).includes(localLanguageTranslate)) {
            languageTranslate.push({ contactId: contact.contactId, lang: localLanguageTranslate });
            setLanguageTranslate(languageTranslate);
            setRefreshChild('updated');
          }
        });

        contact.onConnected(async () => {
          const cnn = contact.getConnections().find(cnn => cnn.getType() === window.connect.ConnectionType.AGENT);
          const agentChatSession = await cnn.getMediaController();
          getEvents(contact, agentChatSession);
        });

        contact.onEnded(() => setLang(''));
        contact.onDestroy(() => {
          setCurrentContactId('');
          clearChat();
        });
      });

      window.connect.agent(agent => {
        agent.onStateChange(agentStateChange => {
          console.log("Agent State Changed:", agentStateChange.newState);
        });
      });
    } else {
      setTimeout(subscribeConnectEvents, 3000);
    }
  }

  useEffect(() => {
    const isInIframe = window.self !== window.top;

    if (isInIframe) {
      console.log("🟡 Inside Amazon Connect Agent Workspace");

      const urlParams = new URLSearchParams(window.location.search);
      const contactId = urlParams.get('contactId');
      if (contactId) {
        setCurrentContactId(contactId);
        console.log("🧾 Set contactId from query param:", contactId);
      }
    } else {
      console.log("🟢 Running standalone with CCP");

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
    <main>
      <Grid columns="equal" stackable padded>
        <Grid.Row>
          {/* CCP is only shown in standalone */}
          {window.self === window.top && <div id="ccp-container"></div>}
          <div id="chatroom">
            <Chatroom session={agentChatSessionState} />
          </div>
        </Grid.Row>
      </Grid>
    </main>
  );
};

export default Ccp;
