import React, { useEffect, useRef, useState } from 'react';
import './chatroom.css';
import Message from './message.js';
//import translateText from './translate'
import translateTextAPI from './translateAPI'
import { addChat, useGlobalState } from '../store/state';

const Chatroom = (props) => {

    const [Chats] = useGlobalState('Chats');
    const currentContactId = useGlobalState('currentContactId');
    const [newMessage, setNewMessage] = useState("");
    const [languageTranslate] = useGlobalState('languageTranslate');
    const [languageOptions] = useGlobalState('languageOptions');
    const agentUsername = 'AGENT';
    const messageEl = useRef(null);
    const input = useRef(null);
    
    function getKeyByValue(object) {
        let obj = languageTranslate.find(o => o.contactId === currentContactId[0]);
        if(obj === undefined) {
            return
          } else {
                return Object.keys(object).find(key => object[key] === obj.lang);
        }
        
    }

    const sendMessage = async(session, content) => {
        const awsSdkResponse = await session.sendMessage({
            contentType: "text/plain",
            message: content
        });
        const { AbsoluteTime, Id } = awsSdkResponse.data;
        console.log(AbsoluteTime, Id);
    }

    useEffect(() => {

        // this ensures that the chat window will auto scoll to ensure the more recent message is in view
        if (messageEl) {
            messageEl.current.addEventListener('DOMNodeInserted', event => {
                const { currentTarget: target } = event;
                target.scroll({ top: target.scrollHeight, behavior: 'smooth' });
            });
        }
        // this ensure that the input box has the focus on load and after each entry
        input.current.focus();
    }, []);


    async function handleSubmit(event) {
        event.preventDefault();
        // if there is no text in the the chat input box, do nothing.
        if (newMessage === "") {
            return;
        }

        // Check if we have a valid currentContactId
        if (!currentContactId || !currentContactId[0]) {
            console.error("No active contact found");
            return;
        }

        // Find the language for the current contact
        let destLang = languageTranslate.find(o => o.contactId === currentContactId[0]);
        
        // If no language is found, use a default language or show an error
        if (!destLang || !destLang.lang) {
            console.error("No language found for the current contact");
            return;
        }

        console.log("destLang: ", destLang);

        // translate the agent message
        console.log(newMessage);
        let translatedMessageAPI = await translateTextAPI(newMessage, 'en', destLang.lang);
        let translatedMessage = translatedMessageAPI.TranslatedText;

        console.log(` Original Message: ` + newMessage + `\n Translated Message: ` + translatedMessage);
        
        // create the new message to add to Chats.
        let data2 = {
            contactId: currentContactId[0],
            username: agentUsername,
            content: <p>{newMessage}</p>,
            translatedMessage: <p>{translatedMessage}</p>,
        };
        
        // add the new message to the store
        addChat(prevMsg => [...prevMsg, data2]);
        
        // clear the chat input box
        setNewMessage("");

        // Get the session for sending the message
        const session = retrieveValue(currentContactId[0]);
        if (session) {
            await sendMessage(session, translatedMessage);
        } else {
            console.error("No active session found for the current contact");
        }
    }

    function retrieveValue(key) {
        var value = "";
        for(var obj in props.session) {
            for(var item in props.session[obj]) {
                if(item === key) {
                    value = props.session[obj][item];
                    break;
                }
            }
        }
        return value;
    }

    return (
        <div className="chatroom">
            <h3>Translate - ({languageTranslate.map(lang => {if(lang.contactId === currentContactId[0])return lang.lang})}) {getKeyByValue(languageOptions)}</h3>
            <ul className="chats" ref={messageEl}>
                {
                    // iterate over the Chats, and only display the messages for the currently active chat session
                    Chats.map(chat => {
                        if(chat.contactId === currentContactId[0])
                            return <Message chat={chat} user={agentUsername} />
                    })
                }
            </ul>
            <form className="input" onSubmit={handleSubmit} >
                <input
                    ref={input}
                    maxLength="1024"
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                />
                <input type="submit" value="Submit" />
            </form>
        </div>
    );
};


export default Chatroom;