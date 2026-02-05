const commands = [];
const replyHandlers = [];

function cmd(info, func) {
    const data = { ...info };
    data.function = func;

    // Normalize pattern
    if (data.pattern) {
        data.pattern = String(data.pattern).toLowerCase();
        commands.push(data);
    }

    // Reply handlers without prefix (also allow commands that have both pattern + filter.)
    if (typeof data.filter === "function") {
        replyHandlers.push(data);
    }

    return data;
}

module.exports = {
    cmd,
    commands,
    replyHandlers
};
