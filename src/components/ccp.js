import React, { useEffect, useState } from 'react';
import { Grid } from 'semantic-ui-react';
import  { Amplify }  from 'aws-amplify';
import awsconfig from '../aws-exports';
import Chatroom from './chatroom';
import translateText from './translate'
import detectText from './detectText'
import { addChat, setLanguageTranslate, clearChat, useGlobalState, setCurrentContactId } from '../store/state';

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

    console.log(lang)
    console.log(currentContactId)
    //console.log(Chats)

    // *******
    // Subscribe to the chat session
    // *******
    function getEvents(contact, agentChatSession) {
        console.log("CDEBUG ===> Setting up chat events for contact:", contact.contactId);
        console.log("CDEBUG ===> Agent chat session:", agentChatSession);

        contact.getAgentConnection().getMediaController().then(controller => {
            console.log("CDEBUG ===> Got media controller for contact:", contact.contactId);
            
            controller.onMessage(messageData => {
                console.log("CDEBUG ===> Received message:", messageData);
                
                if (messageData.chatDetails.participantId === messageData.data.ParticipantId) {
                    console.log(`CDEBUG ===> Agent ${messageData.data.DisplayName} Says:`, messageData.data.Content);
                }
                else {
                    console.log(`CDEBUG ===> Customer ${messageData.data.DisplayName} Says:`, messageData.data.Content);
                    processChatText(messageData.data.Content, messageData.data.Type, messageData.data.ContactId);
                }
            }).catch(error => {
                console.error("CDEBUG ===> Error in onMessage handler:", error);
            });
        }).catch(error => {
            console.error("CDEBUG ===> Error getting media controller:", error);
        });
    }

    // *******
    // Processing the incoming chat from the Customer
    // *******
    async function processChatText(content, type, contactId) {
        console.log("CDEBUG ===> Processing chat text:", { content, type, contactId });
        
        // Check if we know the language for this contactId
        let textLang = '';
        for(var i = 0; i < languageTranslate.length; i++) {
            if (languageTranslate[i].contactId === contactId) {
                textLang = languageTranslate[i].lang;
                break;
            }
        }

        // If the contactId was not found in the store, or the store is empty, perform detectText API
        if (localLanguageTranslate.length === 0 || textLang === '') {
            console.log("CDEBUG ===> No language found, detecting language");
            let tempLang = await detectText(content);
            textLang = tempLang.textInterpretation.language;
            console.log("CDEBUG ===> Detected language:", textLang);
        }

        // Update (or Add if new contactId) the store with the language code
        function upsert(array, item) {
            const i = array.findIndex(_item => _item.contactId === item.contactId);
            if (i > -1) array[i] = item;
            else array.push(item);
        }

        const newLangEntry = { contactId: contactId, lang: textLang };
        upsert(languageTranslate, newLangEntry);
        setLanguageTranslate([...languageTranslate]);
        console.log("CDEBUG ===> Updated languageTranslate:", languageTranslate);
                
        // Translate the customer message into English
        let translatedMessage = await translateText(content, textLang, 'en');
        console.log(`CDEBUG ===> Original Message: ${content}\nTranslated Message: ${translatedMessage}`);
        
        // Create the new message to add to Chats
        let data2 = {
            contactId: contactId,
            username: 'customer',
            content: <p>{content}</p>,
            translatedMessage: <p>{translatedMessage}</p>
        };
        
        // Add the new message to the store
        addChat(prevMsg => [...prevMsg, data2]);
        console.log("CDEBUG ===> Added message to chat store:", data2);
    }

    // *******
    // Subscribing to CCP events
    // *******
    useEffect(() => {
        const connectUrl = process.env.REACT_APP_CONNECT_INSTANCE_URL;
        
        // Check if we're running in an iframe
        const isInIframe = window.self !== window.top;
        const connect = isInIframe ? window.parent.connect : window.connect;
        
        // Initialize the Streams API
        if (isInIframe) {
            // We're in an iframe (Agent Workspace)
            try {
                // Wait for the parent window's connect object to be available
                const checkParentConnect = setInterval(() => {
                    if (connect && connect.core) {
                        clearInterval(checkParentConnect);
                        console.log("CDEBUG ===> Parent window's connect object is available");
                        
                        // Use the parent window's context for event subscription
                        subscribeConnectEvents();
                    }
                }, 1000);

                // Cleanup interval on component unmount
                return () => clearInterval(checkParentConnect);
            } catch (error) {
                console.error("CDEBUG ===> Error accessing parent window's connect object:", error);
            }
        } else {
            // We're running standalone
            connect.core.initCCP(
                document.getElementById("ccp-container"),
                {
                    ccpUrl: connectUrl + "/connect/ccp-v2/",
                    loginPopup: true,
                    loginOptions: {
                        autoClose: true,
                        height: 600,
                        width: 400,
                        top: 0,
                        left: 0
                    },
                    region: process.env.REACT_APP_CONNECT_REGION,
                    softphone: {
                        allowFramedSoftphone: true,
                        disableRingtone: false,
                        ringtoneUrl: "./ringtone.mp3"
                    }
                }
            );

            // Wait for the CCP to be ready before subscribing to events
            const checkCCPReady = setInterval(() => {
                if (connect.core.getAgentDataProvider()) {
                    clearInterval(checkCCPReady);
                    console.log("CDEBUG ===> CCP is ready, subscribing to events");
                    subscribeConnectEvents();
                }
            }, 1000);

            // Cleanup interval on component unmount
            return () => clearInterval(checkCCPReady);
        }
    }, []);

    function subscribeConnectEvents() {
        const isInIframe = window.self !== window.top;
        const connect = isInIframe ? window.parent.connect : window.connect;

        if (!connect || !connect.core) {
            console.error("CDEBUG ===> Connect object not available");
            return;
        }

        console.log("CDEBUG ===> Starting to subscribe to connect events");

        connect.core.onViewContact(function(event) {
            var contactId = event.contactId;
            console.log("CDEBUG ===> onViewContact", contactId);
            setCurrentContactId(contactId);    
        });

        // If this is a chat session
        if (connect.ChatSession) {
            console.log("CDEBUG ===> Subscribing to Connect Contact Events for chats");
            connect.contact(contact => {
                console.log("CDEBUG ===> Contact object received:", contact.contactId);

                // This is invoked when the chat is accepted
                contact.onAccepted(async() => {
                    console.log("CDEBUG ===> onAccepted: ", contact);
                    const cnn = contact.getConnections().find(cnn => cnn.getType() === connect.ConnectionType.AGENT);
                    const agentChatSession = await cnn.getMediaController();
                    setCurrentContactId(contact.contactId);
                    console.log("CDEBUG ===> agentChatSession ", agentChatSession);
                    
                    // Save the session to props
                    setAgentChatSessionState(agentChatSessionState => [...agentChatSessionState, {[contact.contactId] : agentChatSession}]);
                
                    // Get the language from the attributes
                    const attributes = contact.getAttributes();
                    console.log("CDEBUG ===> Contact attributes:", attributes);
                    
                    if (attributes && attributes.x_lang && attributes.x_lang.value) {
                        localLanguageTranslate = attributes.x_lang.value;
                        console.log("CDEBUG ===> Language from attributes:", localLanguageTranslate);
                        
                        if (Object.keys(languageOptions).find(key => languageOptions[key] === localLanguageTranslate) !== undefined) {
                            console.log("CDEBUG ===> Setting lang code from attributes:", localLanguageTranslate);
                            languageTranslate.push({contactId: contact.contactId, lang: localLanguageTranslate});
                            setLanguageTranslate(languageTranslate);
                            setRefreshChild('updated');
                        }
                    }
                });

                // This is invoked when the customer and agent are connected
                contact.onConnected(async() => {
                    console.log("CDEBUG ===> onConnected() >> contactId: ", contact.contactId);
                    const cnn = contact.getConnections().find(cnn => cnn.getType() === connect.ConnectionType.AGENT);
                    const agentChatSession = await cnn.getMediaController();
                    getEvents(contact, agentChatSession);
                });
            });
        }
        else {
            console.log("CDEBUG ===> ChatSession not available, waiting 3s");
            setTimeout(function() { subscribeConnectEvents(); }, 3000);
        }
    };

    return (
        <main>
          <Grid columns='equal' stackable padded>
          <Grid.Row>
            {/* CCP window will load here */}
            <div id="ccp-container"></div>
            {/* Translate window will laod here. We pass the agent state to be able to use this to push messages to CCP */}
            <div id="chatroom" ><Chatroom session={agentChatSessionState}/> </div> 
            </Grid.Row>
          </Grid>
        </main>
    );
};

export default Ccp;