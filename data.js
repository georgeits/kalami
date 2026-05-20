export const ADMIN_EMAIL = "giorgijavakhishvili75@gmail.com";
export const BANK_ACCOUNT = "GE92BG0000000612371503";
export const SUBSCRIPTION_DAYS = 30;

export const packageCatalog = [
  {
    id: "core",
    name: "5 ლარიანი პაკეტი",
    price: 5,
    description: "შინაარსი, ბიოგრაფია, დახასიათება, გეგმა და განხილვა.",
    features: ["ბიოგრაფია", "შინაარსი", "დახასიათება", "გეგმა", "განხილვა"],
  },
  {
    id: "plus",
    name: "10 ლარიანი პაკეტი",
    price: 10,
    description: "ყველაფერი + ქვიზები და სავარჯიშო ტესტები.",
    features: ["ბიოგრაფია", "შინაარსი", "დახასიათება", "გეგმა", "განხილვა", "ქვიზები", "ტესტები"],
  },
];

const makeWork = (id, title) => ({
  id,
  title,
  tabs: {
    summary: {
      label: "შინაარსი",
      content:
        "მოკლე შინაარსი, საკვანძო ეპიზოდები და თემატური ხაზები. <mark>ეს მონაკვეთი გამოკვეთილია, რათა ესეს არგუმენტები სწრაფად დაინახოს მოსწავლემ.</mark>",
    },
    biography: {
      label: "განხილვა",
      content:
        "იდეური ანალიზი, თემები, ჟანრული თავისებურებები და ეპოქასთან კავშირი. <mark>არგუმენტისთვის გამოსადეგი თეზები აქ ოქროსფრად არის გამოკვეთილი.</mark>",
    },
    characters: {
      label: "დახასიათება",
      content:
        "მთავარი პერსონაჟები, მათი მოტივაცია, ღირებულებები და კონფლიქტები.",
    },
    plan: {
      label: "გეგმა",
      content:
        "სავარაუდო სასწავლო გეგმა: ავტორის კონტექსტი, ნაწარმოების სტრუქტურა, თემები, პერსონაჟები, ციტატები.",
    },
    quotes: {
      label: "ციტატები",
      content:
        "<mark>გამორჩეული ციტატები და მტკიცებულებები</mark> მოსწავლისთვის, რომ წერით ნაწილში სწრაფად გამოიყენოს.",
    },
  },
  quizzes: [
    {
      question: "რა არის ნაწარმოების ძირითადი თემა?",
      options: ["ღირებულებითი კონფლიქტი", "მხოლოდ ბუნების აღწერა", "მხოლოდ ბიოგრაფიული ფაქტი"],
      answerIndex: 0,
    },
  ],
});

export const seedAuthors = [
  { id: "iakob-khutsesi", name: "იაკობ ხუცესი", era: "ჰაგიოგრაფია", bio: "ადრეული ქართული ჰაგიოგრაფიის კლასიკოსი.", works: [makeWork("shushanikis-tsameba", "შუშანიკის წამება")] },
  { id: "iovane-sabanisdze", name: "იოვანე საბანისძე", era: "ჰაგიოგრაფია", bio: "აბო თბილელის ცხოვრების ავტორი.", works: [makeWork("abo-tbililis-tsameba", "აბო თბილელის წამება")] },
  { id: "giorgi-merchule", name: "გიორგი მერჩულე", era: "ჰაგიოგრაფია", bio: "გრიგოლ ხანძთელის ცხოვრებით ცნობილი მწერალი.", works: [makeWork("grigol-khandztelis-cxovreba", "გრიგოლ ხანძთელის ცხოვრება")] },
  { id: "shota-rustaveli", name: "შოთა რუსთველი", era: "რენესანსი", bio: "ქართული ეპიკური პოეზიის უმაღლესი ფიგურა.", works: [makeWork("vepkhistqaosani", "ვეფხისტყაოსანი")] },
  { id: "sulkhan-saba", name: "სულხან-საბა ორბელიანი", era: "განმანათლებლობა", bio: "იგავური აზროვნებისა და მორალური კრიტიკის ოსტატი.", works: [makeWork("sibrzne-sicruisa", "სიბრძნე სიცრუისა")] },
  { id: "guramishvili", name: "დავით გურამიშვილი", era: "განმანათლებლობა", bio: "ქართულ პოეზიაში ბიოგრაფიული ხმის გამორჩეული ავტორი.", works: [makeWork("davitiani", "დავითიანი")] },
  { id: "chavchavadze", name: "ალექსანდრე ჭავჭავაძე", era: "რომანტიზმი", bio: "ქართველ რომანტიკოსთა ერთ-ერთი წინამორბედი.", works: [makeWork("vakhtang-orbeliani", "ვაჰ, სოფელო")] },
  { id: "orbeliani", name: "გრიგოლ ორბელიანი", era: "რომანტიზმი", bio: "პატრიოტული და ელეგიური პოეზიის მნიშვნელოვანი წარმომადგენელი.", works: [makeWork("sadghegrdzelo", "სადღეგრძელო")] },
  { id: "baratashvili", name: "ნიკოლოზ ბარათაშვილი", era: "რომანტიზმი", bio: "ფილოსოფიური ლირიკის გენიოსი.", works: [makeWork("merani", "მერანი")] },
  { id: "ilia", name: "ილია ჭავჭავაძე", era: "რეალიზმი", bio: "მწერალი, მოაზროვნე და ეროვნული მოძრაობის ლიდერი.", works: [makeWork("kacia-adamiani", "კაცია-ადამიანი?!"), makeWork("otaraant-qvrivi", "ოთარაანთ ქვრივი")] },
  { id: "akaki", name: "აკაკი წერეთელი", era: "რეალიზმი", bio: "მოქალაქეობრივი პოეზიის თვალსაჩინო ავტორი.", works: [makeWork("gamzrdeli", "გამზრდელი")] },
  { id: "kazbegi", name: "ალექსანდრე ყაზბეგი", era: "რეალიზმი", bio: "მთის ყოფისა და მორალური კოდექსის მწერალი.", works: [makeWork("khevisberi-gocha", "ხევისბერი გოჩა")] },
  { id: "vazha", name: "ვაჟა-ფშაველა", era: "მე-19-20 სს.", bio: "ინდივიდისა და თემის დაპირისპირების დიდოსტატი.", works: [makeWork("aluda-qetelauri", "ალუდა ქეთელაური"), makeWork("stumar-maspindzeli", "სტუმარ-მასპინძელი")] },
  { id: "kldiashvili", name: "დავით კლდიაშვილი", era: "რეალიზმი", bio: "სოციალური ირონიისა და ოჯახური დრამის ავტორი.", works: [makeWork("samanishvilis-dedinacvali", "სამანიშვილის დედინაცვალი")] },
  { id: "lortkipanidze", name: "გრიგოლ ლორთქიფანიძე", era: "მე-20 სს.", bio: "ქართული პროზის მნიშვნელოვანი ფიგურა.", works: [makeWork("qartuli-proza", "რჩეული მოთხრობები")] },
  { id: "gamsakhurdia", name: "კონსტანტინე გამსახურდია", era: "მე-20 სს.", bio: "ფსიქოლოგიური და ისტორიული პროზის ოსტატი.", works: [makeWork("didostatis-mardjvena", "დიდოსტატის მარჯვენა")] },
  { id: "javakhishvili", name: "მიხეილ ჯავახიშვილი", era: "მე-20 სს.", bio: "მოდერნული ქართული პროზის ერთ-ერთი უმთავრესი ავტორი.", works: [makeWork("jaqos-khiznebi", "ჯაყოს ხიზნები")] },
  { id: "qiachieli", name: "ლეო ქიაჩელი", era: "მე-20 სს.", bio: "სოციალური და ფსიქოლოგიური პროზის წარმომადგენელი.", works: [makeWork("tariel-golua", "ტარიელ გოლუა")] },
  { id: "kakabadze", name: "პოლიკარპე კაკაბაძე", era: "მე-20 სს.", bio: "დრამატურგი და სატირული აზროვნების ავტორი.", works: [makeWork("kvarkvare", "ყვარყვარე თუთაბერი")] },
  { id: "galaktioni", name: "გალაკტიონ ტაბიძე", era: "სიმბოლიზმი", bio: "ქართული ლირიკის ერთ-ერთი მწვერვალი.", works: [makeWork("mtatsmindis-mtvare", "მთაწმინდის მთვარე")] },
  { id: "ticiani", name: "ტიციან ტაბიძე", era: "სიმბოლიზმი", bio: "ცისფერყანწელთა მნიშვნელოვანი პოეტი.", works: [makeWork("poezia", "რჩეული ლექსები")] },
  { id: "paolo", name: "პაოლო იაშვილი", era: "სიმბოლიზმი", bio: "მოდერნისტული პოეზიის დახვეწილი ხმა.", works: [makeWork("poems", "რჩეული ლექსები")] },
  { id: "leonidze", name: "გიორგი ლეონიძე", era: "მე-20 სს.", bio: "ეროვნული სახეების და ბუნების პოეტი.", works: [makeWork("natvris-khe", "ნატვრის ხე")] },
  { id: "rcheulishvili", name: "გურამ რჩეულიშვილი", era: "მე-20 სს.", bio: "ახალი თაობის თავისუფალი პროზის ავტორი.", works: [makeWork("alaverdoba", "ალავერდობა")] },
  { id: "kalandadze", name: "ანა კალანდაძე", era: "თანამედროვე", bio: "ლირიკული ინტონაციის გამორჩეული პოეტი.", works: [makeWork("poems", "რჩეული ლექსები")] },
  { id: "qarchkhadze", name: "ჯემალ ქარჩხაძე", era: "თანამედროვე", bio: "ფილოსოფიური პროზისა და ძლიერი სიუჟეტური ქსოვილის ავტორი.", works: [makeWork("igi", "იგი")] },
  { id: "dochanashvili", name: "გურამ დოჩანაშვილი", era: "თანამედროვე", bio: "თბილი ირონიის, ჰუმანიზმისა და ინტელექტუალური თამაშის გამორჩეული პროზაიკოსი.", works: [makeWork("kaci-romelsac-literatura", "კაცი, რომელსაც ლიტერატურა ძლიერ უყვარდა")] },
];

export const defaultFirebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};
