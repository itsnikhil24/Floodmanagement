## Contributors

- [Nikhil Sharma](https://github.com/itsnikhil24/) - Project Setup, Backend Development
- [Ambika Kashyap](https://github.com/AMBIKAKAS/) - Frontend Design And Implementation



## To execute this application follow the mentioned steps below :

Step 1: Git clone this repository using  this command : git clone https://github.com/itsnikhil24/Floodmanagement.git

Step 2: Install all the packages needed for the application using : npm install

Step 3: Open the terminal in directory and run the server using command: node index.js

Step 4: Open any browser and write Local : http://localhost:5007



## User caan register and create own login details otherwise use given below details:

- username: 23BCC70030
- password: 123





# 🥁Introduction

FarmFloodAid is a web application designed to support farmers in flood-prone areas of Myanmar. It provides a chatbot for flood management guidance, a marketplace for selling surplus crops to reduce waste, and a directory of NGOs offering local assistance. Our goal is to empower farmers with tools, resources, and connections to help them better manage and recover from flood impacts.

## 💡Inspiration:


The inspiration for FarmFloodAid comes from the challenges faced by farmers in flood-prone areas, where severe weather can devastate livelihoods and disrupt food supplies. Seeing how frequent floods lead to waterlogged fields, crop wastage, and limited access to timely aid, we aimed to create a solution that would empower these communities. By providing direct support through technology—a chatbot for guidance, a marketplace to reduce crop waste, and accessible information on local NGOs—we wanted to bridge the gap between farmers and the resources they need, fostering resilience and self-sufficiency even in the face of natural disasters.
  
## 💬 What it does:

- AI Chatbot Support: Provides farmers with quick, AI-driven guidance on flood management strategies to help protect their crops during severe flooding.
- Marketplace for Surplus Crops:

Farmers fill out a form with details (item name, quantity, price, address, phone number, and image) to list surplus crops.
Once submitted, these posts appear on the marketplace page, making them visible for buyers, including NGOs and individuals needing fresh produce.
- NGO Information Directory: Lists details of nearby NGOs to connect farmers with organizations offering essential support during emergencies or for other assistance needs.


## 🛠 How we built it

We built the application using EJS for rendering dynamic HTML, CSS for styling, and JavaScript for client-side functionality. The server-side operations were handled by Node.js and Express, while MongoDB was used for database management.


## ❗Challenges we ran into:

-  Uploading images to MongoDB: Configuring GridFS to handle and store images files effectively.
-  Deployment Issues: Deploying the application introduced complications with image uploads, which affected the functionality of the form submission on the marketplace page, preventing users from successfully listing their items.
