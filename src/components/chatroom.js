import React, { useEffect, useRef, useState } from 'react';
import './chatroom.css';
import Message from './message.js';
import translateTextAPI from './translateAPI';
import {
  addChat,
  setLanguageTranslate,
  useGlobalState
} from '../store/state';

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
    const obj = languageTranslate.find(o => o.contactId === currentContactId[0]);
    if (!obj) return;
    return Object.keys(object).find(key => object[key] === obj.lang);
  }

  const sendMessage = async (session, content) => {
    if (!session) return;
    const awsSdkResponse = await session.sendMessage({
      contentType: "text/plain",
      message: content
    });
    const { AbsoluteTime, Id } = awsSdkResponse.data;
    console.log(AbsoluteTime, Id);
  };

  useEffect(() => {
    if (messageEl.current) {
      messageEl.current.addEventListener('DOMNodeInserted', event => {
        const { currentTarget: target } = event;
        target.scroll({ top: target.scrollHeight, behavior: 'smooth' });
      });
    }
    input.current.focus();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (newMessage === "") return;

    const contactId = currentContactId[0];
    let langEntry = languageTranslate.find(o => o.contactId === contactId);
    let lang = langEntry?.lang;

    if (!lang) {
      try {
        const detected = await translateTextAPI(newMessage, 'auto', 'en');
        lang = detected?.SourceLanguageCode || 'en';

        const updated = [...languageTranslate.filter(l => l.contactId !== contactId), { contactId, lang }];
        setLanguageTranslate(updated);
      } catch (e) {
        console.warn("Language detection failed. Using 'en'");
        lang = 'en';
      }
    }

    const translatedMessageAPI = await translateTextAPI(newMessage, 'en', lang);
    const translatedMessage = translatedMessageAPI.TranslatedText;

    const chatData = {
      contactId,
      username: agentUsername,
      content: <p>{newMessage}</p>,
      translatedMessage: <p>{translatedMessage}</p>
    };

    addChat(prev => [...prev, chatData]);
    setNewMessage("");

    const session = retrieveSession(contactId);
    if (session) {
      await sendMessage(session, translatedMessage);
    } else {
      console.log("No session – skipped sendMessage");
    }
  }

  function retrieveSession(key) {
    for (const obj in props.session) {
      for (const item in props.session[obj]) {
        if (item === key) return props.session[obj][item];
      }
    }
    return null;
  }

  return (
    <div className="chatroom">
      <h3>
        Translate - (
        {languageTranslate.map(lang => {
          if (lang.contactId === currentContactId[0]) return lang.lang;
        })}
        ) {getKeyByValue(languageOptions)}
      </h3>
      <ul className="chats" ref={messageEl}>
        {Chats.map(chat => (
          chat.contactId === currentContactId[0] && <Message chat={chat} user={agentUsername} />
        ))}
      </ul>
      <form className="input" onSubmit={handleSubmit}>
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
