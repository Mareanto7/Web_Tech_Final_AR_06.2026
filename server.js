const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('B&B booking app — running');
});

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));