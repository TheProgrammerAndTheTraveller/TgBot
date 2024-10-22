const fs = require('fs');
const puppeteer = require('puppeteer'); 
const dotenv = require('dotenv'); 
const TelegramBot = require('node-telegram-bot-api');

dotenv.config({ path: '.env.local' });

const token = process.env.TgToken;
const bot = new TelegramBot(token, { polling: true });
const myChatId = parseInt(process.env.MishaChatID, 10);
const otherchatId = parseInt(process.env.RominaChatID, 10);

// Автоматическая проверка данных каждые 15 минут
setInterval(async () => {
  console.log('Запуск автоматической проверки данных...');
  await checkAndUpdateData('almaty', otherchatId, 'datesAlmaty.txt');
  await checkAndUpdateData('astana', otherchatId, 'datesAstana.txt');
}, 900000); // 15 минут = 900000 мс

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (chatId === myChatId || chatId === otherchatId) {
    if (msg.text === 'Получить данные в Алматы') {
      await bot.sendMessage(chatId, 'Получаем данные. Это может занять некоторое время, пожалуйста, ожидайте...');
      await fetchDataFromWebsite(chatId, 'almaty', 'datesAlmaty.txt', false); // без проверки
    } else if (msg.text === 'Получить данные в Астане') {
      await bot.sendMessage(chatId, 'Получаем данные. Это может занять некоторое время, пожалуйста, ожидайте...');
      await fetchDataFromWebsite(chatId, 'astana', 'datesAstana.txt', false); // без проверки
    } else {
      const inlineOptions = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Получить данные в Алматы', callback_data: 'get_data_almaty' }],
            [{ text: 'Получить данные в Астане', callback_data: 'get_data_astana' }]
          ]
        }
      };
      const keyboardOptions = {
        reply_markup: {
          keyboard: [
            [{ text: 'Получить данные в Алматы' }],
            [{ text: 'Получить данные в Астане' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      };

      await bot.sendMessage(chatId, 'Здравствуй! Нажми на кнопку, чтобы получить данные:', inlineOptions);
      await bot.sendMessage(chatId, 'Или нажми на кнопки ниже.', keyboardOptions);
    }
  } else {
    bot.sendMessage(chatId, 'Извините, я отвечаю только моему владельцу.');
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (chatId === myChatId || chatId === otherchatId) {
    if (data === 'get_data_almaty') {
      await bot.sendMessage(chatId, 'Получаем данные. Это может занять некоторое время, пожалуйста, ожидайте...');
      await fetchDataFromWebsite(chatId, 'almaty', 'datesAlmaty.txt', false); // без проверки
    } else if (data === 'get_data_astana') {
      await bot.sendMessage(chatId, 'Получаем данные. Это может занять некоторое время, пожалуйста, ожидайте...');
      await fetchDataFromWebsite(chatId, 'astana', 'datesAstana.txt', false); // без проверки
    }
  } else {
    await bot.sendMessage(chatId, 'Извините, я отвечаю только моему владельцу.');
  }
});

// Функция для проверки и обновления данных (только для автоматического режима)
async function checkAndUpdateData(city, chatId, fileName) {
  await fetchDataFromWebsite(chatId, city, fileName, true);
}

// Функция для получения данных и обновления файлов
async function fetchDataFromWebsite(chatId, city, fileName, checkChanges) {
  try {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('https://ais.usvisa-info.com/ru-kz/niv/users/sign_in', { waitUntil: 'networkidle2' });
    await page.setViewport({ width: 1080, height: 1024 });

    await page.type('#user_email', process.env.LOGIN);
    await page.type('#user_password', process.env.PASSWORD);

    const bird = '#policy_confirmed';
    await page.click(bird);
    const confirmation = '[name="commit"]';
    await page.click(confirmation);
    await page.waitForSelector('table');

    const cards = await page.$$('tr');

    let foundNonResident = false;
    let nonResidentId = null;

    for (let i = 1; i < cards.length; i++) { 
      const columns = await cards[i].$$('td');
      if (columns.length > 0) {
        const passportNumber = await page.evaluate(cell => cell.innerText, columns[0]);
        if (!passportNumber.startsWith('N')) {
          const buttonSelector = 'a.button.primary.small';
          await page.waitForSelector(buttonSelector);
          const href = await page.$eval(buttonSelector, el => el.getAttribute('href'));
          nonResidentId = href.split('/')[4];
          foundNonResident = true;
          break;
        }
      }
    }

    if (foundNonResident && nonResidentId) {
      let apiUrl;
      let headers;

      if (city === 'almaty') {
        apiUrl = `https://ais.usvisa-info.com/ru-kz/niv/schedule/${nonResidentId}/appointment/days/135.json?appointments[expedite]=false`;
        headers = {
          'X-CSRF-Token': '5WNweB+In8wQibNCBVu8IzEomX2fNVk4YIEcTyT5+zoex/BAPpIE2Sq2GzY0DuoBnCUWVqtsbnnskTp9JxpXqA==',
          'Cookie': '_yatri_session=4e78037f9aaf6770a3fe2d62e5c7ac42',
          'X-Requested-With': 'XMLHttpRequest'
        };
      } else if (city === 'astana') {
        apiUrl = `https://ais.usvisa-info.com/ru-kz/niv/schedule/${nonResidentId}/appointment/days/134.json?appointments[expedite]=false`;
        headers = {
          'X-CSRF-Token': 'SBtP/bm1QjTcC98vGSxB7xJOC/vFdPA/ciN/970ilrWls4gpPQhI56TX6EVRLcwiw6F6fCmzEPpLQoVN1KLh/w==',
          'Cookie': '_yatri_session=5c78045f6ab6770b3fe2e65e7c8db42',
          'X-Requested-With': 'XMLHttpRequest'
        };
      }

      const result = await page.evaluate(async (apiUrl, headers) => {
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: headers
        });

        if (!response.ok) {
          throw new Error(`Ошибка при запросе API: ${response.status}`);
        }

        const text = await response.text();

        if (text.startsWith('<')) {
          throw new Error('Сервер вернул HTML вместо JSON.');
        }

        try {
          const data = JSON.parse(text);
          return data;
        } catch (error) {
          throw new Error('Ошибка парсинга JSON: ' + text);
        }
      }, apiUrl, headers);

      // Если автоматическая проверка — проверяем изменения и обновляем файл
      if (checkChanges) {
        const newData = JSON.stringify(result, null, 2);

        if (fs.existsSync(fileName)) {
          const oldData = fs.readFileSync(fileName, 'utf8');

          // Если файл пустой или данные изменились — отправляем и записываем
          if (oldData === '' || oldData !== newData) {
            fs.writeFileSync(fileName, newData);
            console.log(`${city}: Данные обновлены и сохранены в файл.`);
            await bot.sendMessage(myChatId, `Новые данные по ${city}: ` + newData);
            await bot.sendMessage(otherchatId, `Новые данные по ${city}: ` + newData);
          } else {
            console.log(`${city}: Данные не изменились`);
          }
        } else {
          // Если файл отсутствует или пустой, создаем и отправляем данные
          fs.writeFileSync(fileName, newData);
          console.log(`${city}: Файл создан и данные записаны.`);
          await bot.sendMessage(myChatId, `Новые данные по ${city}: ` + newData);
          await bot.sendMessage(otherchatId, `Новые данные по ${city}: ` + newData);
        }
      } else {
        // Если вызов через кнопку — отправляем данные без проверки
        await bot.sendMessage(chatId, `Данные по ${city}: ` + JSON.stringify(result, null, 2));
      }
    } else {
      await bot.sendMessage(chatId, 'Таких нерезидентов нет.');
    }

    await browser.close();
  } catch (error) {
    console.error('Error fetching data:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при получении данных.');
  }
}
