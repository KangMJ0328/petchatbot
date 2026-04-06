// 카카오 i 오픈빌더 응답 포맷 헬퍼

function simpleText(text) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}

function basicCard({ title, description, imageUrl, buttons = [] }) {
  const card = { title, description };

  if (imageUrl) {
    card.thumbnail = { imageUrl };
  }

  if (buttons.length > 0) {
    card.buttons = buttons.map(btn => ({
      action: btn.action || 'message',
      label: btn.label,
      messageText: btn.messageText || btn.label,
    }));
  }

  return {
    version: '2.0',
    template: {
      outputs: [{ basicCard: card }],
    },
  };
}

function listCard({ title, items, buttons = [] }) {
  return {
    version: '2.0',
    template: {
      outputs: [{
        listCard: {
          header: { title },
          items: items.map(item => ({
            title: item.title,
            description: item.description || '',
            imageUrl: item.imageUrl || undefined,
          })),
          buttons: buttons.map(btn => ({
            action: btn.action || 'message',
            label: btn.label,
            messageText: btn.messageText || btn.label,
          })),
        },
      }],
    },
  };
}

function textWithQuickReplies(text, quickReplies) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
      quickReplies: quickReplies.map(qr => ({
        action: 'message',
        label: qr.label,
        messageText: qr.messageText || qr.label,
      })),
    },
  };
}

function basicCardWithQuickReplies({ title, description, imageUrl, buttons = [], quickReplies = [] }) {
  const resp = basicCard({ title, description, imageUrl, buttons });
  if (quickReplies.length > 0) {
    resp.template.quickReplies = quickReplies.map(qr => ({
      action: 'message',
      label: qr.label,
      messageText: qr.messageText || qr.label,
    }));
  }
  return resp;
}

module.exports = {
  simpleText,
  basicCard,
  listCard,
  textWithQuickReplies,
  basicCardWithQuickReplies,
};
