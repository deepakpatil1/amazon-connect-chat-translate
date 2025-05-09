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
        // Use the full Connect instance URL from environment variables
        const connectUrl = process.env.REACT_APP_CONNECT_INSTANCE_URL;
        console.log("CDEBUG ===> Connect URL:", connectUrl);
        
        // Check if we're running in an iframe
        const isInIframe = window.self !== window.top;
        console.log("CDEBUG ===> Running in iframe:", isInIframe);

        // Initialize Connect Streams
        const initConnectStreams = async () => {
            try {
                // First, ensure the connect object is available
                if (!window.connect) {
                    console.error("CDEBUG ===> Connect Streams not loaded");
                    return;
                }

                // Initialize CCP with proper configuration
                const initConfig = {
                    ccpUrl: connectUrl + "/connect/ccp-v2/",
                    loginPopup: !isInIframe,
                    loginOptions: isInIframe ? undefined : {
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
                    },
                    pageOptions: {
                        enableAudioDeviceSettings: true,
                        enablePhoneTypeSettings: true
                    },
                    ccpAckTimeout: 5000,
                    ccpSynTimeout: 3000,
                    ccpLoadTimeout: 10000
                };

                console.log("CDEBUG ===> Initializing CCP with config:", initConfig);

                // Initialize CCP
                await window.connect.core.initCCP(
                    document.getElementById("ccp-container"),
                    initConfig
                );

                // Wait for CCP to be ready
                const checkCCPReady = setInterval(() => {
                    if (window.connect.core.getAgentDataProvider()) {
                        clearInterval(checkCCPReady);
                        console.log("CDEBUG ===> CCP is ready, subscribing to events");
                        subscribeConnectEvents();
                    } else {
                        console.log("CDEBUG ===> Waiting for CCP to be ready...");
                    }
                }, 1000);

                // Cleanup interval on component unmount
                return () => clearInterval(checkCCPReady);
            } catch (error) {
                console.error("CDEBUG ===> Error during Connect Streams initialization:", error);
                // Retry initialization after a delay
                setTimeout(initConnectStreams, 5000);
            }
        };

        // Start initialization
        initConnectStreams();
    }, []);

    function subscribeConnectEvents() {
        if (!window.connect || !window.connect.core) {
            console.error("CDEBUG ===> Connect Streams not initialized");
            return;
        }

        const connect = window.connect;
        console.log("CDEBUG ===> Subscribing to connect events");
        console.log("CDEBUG ===> Connect object available:", !!connect);
        console.log("CDEBUG ===> Connect.core available:", !!(connect && connect.core));

        connect.core.onViewContact(function(event) {
            var contactId = event.contactId;
            console.log("CDEBUG ===> onViewContact", contactId);
            setCurrentContactId(contactId);    
        });

        // If this is a chat session
        if (connect.ChatSession) {
            console.log("CDEBUG ===> ChatSession available, subscribing to contact events");
            connect.contact(contact => {
                console.log("CDEBUG ===> Contact object received:", contact.contactId);
                console.log("CDEBUG ===> Contact type:", contact.getType());
                console.log("CDEBUG ===> Contact state:", contact.getState());

                // This is invoked when the chat is accepted
                contact.onAccepted(async() => {
                    console.log("CDEBUG ===> onAccepted: ", contact);
                    const cnn = contact.getConnections().find(cnn => cnn.getType() === connect.ConnectionType.AGENT);
                    if (cnn) {
                        const agentChatSession = await cnn.getMediaController();
                        console.log("CDEBUG ===> Media controller obtained:", !!agentChatSession);
                        setCurrentContactId(contact.contactId);
                        
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
                    }
                });

                // This is invoked when the customer and agent are connected
                contact.onConnected(async() => {
                    console.log("CDEBUG ===> onConnected() >> contactId: ", contact.contactId);
                    const cnn = contact.getConnections().find(cnn => cnn.getType() === connect.ConnectionType.AGENT);
                    if (cnn) {
                        const agentChatSession = await cnn.getMediaController();
                        console.log("CDEBUG ===> Media controller obtained in onConnected:", !!agentChatSession);
                        getEvents(contact, agentChatSession);
                    }
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