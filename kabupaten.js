const options = data.data.map(kab => `
<option value="${kab.id}">
    ${kab.name}
</option>
`).join("");

return {
    statusCode: 200,
    body: JSON.stringify({
        success: true,
        options
    })
};