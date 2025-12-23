const commands = [];
const replyHandlers = [];

function cmd(info, func) {
    const data = info;
    data.function = func;

    // Normalize pattern
    if (data.pattern) {
        data.pattern = data.pattern.toLowerCase();
        commands.push(data);
    } 
    
    // Reply handlers without prefix
    else if (typeof data.filter === "function") {
        replyHandlers.push(data);
    }

    return data;
}

module.exports = {
    cmd,
    commands,
    replyHandlers
};
