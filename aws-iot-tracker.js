// AFL Ball Tracker - Fixed version
// Global Variables
let appWidth = 1200;
let appHeight = 800;
let ballX = appWidth / 2;
let ballY = appHeight / 2;
let lastMessageTime = 0;
let ballSize = 65; // Size of the ball image

// AWS IoT and MQTT settings
let client = null;
let connectionStatus = false;
let mqttTopic = "marvel_AUS/ai_pub"; // Default topic
let awsIotEndpoint = "a3lkzcadhi1yzr-ats.iot.ap-southeast-2.amazonaws.com";
let statusMessage = "";
let lastReceivedMessage = "";

// UI elements
let connectButton;
let topicInput;
let statusDiv;

// Certificate files
let certFile = null;
let privateKeyFile = null;
let rootCAFile = null;
let certFileLoaded = false;
let privateKeyLoaded = false;
let rootCALoaded = false;

// Images
let fieldImage;
let ballImage;

function preload() {
  // Load images
  fieldImage = loadImage('images/PitchCorrect.png');
  ballImage = loadImage('images/AFLBall.png');
}

function setup() {
  const cnv = createCanvas(appWidth, appHeight);
  cnv.parent('canvas-container');
  
  // Setup UI elements
  setupUI();
  
  frameRate(60);
}

function setupUI() {
  // Create UI container for settings
  const settingsContainer = createDiv();
  settingsContainer.id('settings-container');
  settingsContainer.position(10, 10);
  settingsContainer.style('background-color', 'rgba(255, 255, 255, 0.8)');
  settingsContainer.style('padding', '10px');
  settingsContainer.style('border-radius', '8px');
  settingsContainer.style('z-index', '10');
  settingsContainer.style('min-width', '300px');
  
  // AWS IoT Endpoint (display only, not editable)
  createP('AWS IoT Endpoint:').parent(settingsContainer);
  const endpointInput = createInput(awsIotEndpoint);
  endpointInput.parent(settingsContainer);
  endpointInput.style('width', '280px');
  endpointInput.attribute('readonly', true);
  endpointInput.style('background-color', '#f0f0f0');
  
  // MQTT Topic input
  createP('MQTT Topic:').parent(settingsContainer);
  topicInput = createInput(mqttTopic);
  topicInput.parent(settingsContainer);
  topicInput.style('width', '280px');
  
  // Certificate file uploads
  createDiv('<hr>').parent(settingsContainer);
  createP('<b>AWS IoT Certificates</b>').parent(settingsContainer).style('margin-bottom', '5px');
  
  // Certificate file input
  createP('Device Certificate (.pem.crt):').parent(settingsContainer).style('margin-bottom', '5px');
  certFileInput = createFileInput(handleCertFile);
  certFileInput.parent(settingsContainer);
  certFileInput.style('margin-bottom', '10px');
  
  // Private key file input
  createP('Private Key (.private.key):').parent(settingsContainer).style('margin-bottom', '5px');
  privateKeyInput = createFileInput(handlePrivateKeyFile);
  privateKeyInput.parent(settingsContainer);
  privateKeyInput.style('margin-bottom', '10px');
  
  // Root CA file input
  createP('Root CA Certificate (AmazonRootCA1.pem):').parent(settingsContainer).style('margin-bottom', '5px');
  rootCAInput = createFileInput(handleRootCAFile);
  rootCAInput.parent(settingsContainer);
  rootCAInput.style('margin-bottom', '10px');
  
  // Status indicators for file uploads
  statusDiv = createDiv();
  statusDiv.parent(settingsContainer);
  statusDiv.id('file-status');
  statusDiv.style('margin-top', '10px');
  statusDiv.style('margin-bottom', '10px');
  statusDiv.style('font-size', '14px');
  
  // Connect button
  connectButton = createButton('Connect to AWS IoT');
  connectButton.parent(settingsContainer);
  connectButton.style('margin-top', '10px');
  connectButton.style('padding', '8px 16px');
  connectButton.style('background-color', '#cccccc'); // Start with disabled color
  connectButton.style('color', 'white');
  connectButton.style('border', 'none');
  connectButton.style('border-radius', '4px');
  connectButton.style('cursor', 'not-allowed'); // Start with disabled cursor
  connectButton.style('width', '280px');
  connectButton.attribute('disabled', ''); // Disable initially
  connectButton.mousePressed(connectToAWSIoT);
  
  // Update the file status display initially
  updateFileStatus();
}

// Update file status indicators
function updateFileStatus() {
  if (!statusDiv) return; // Safety check
  
  statusDiv.html(`
    <div>Certificate: ${certFileLoaded ? '✅ Loaded' : '❌ Missing'}</div>
    <div>Private Key: ${privateKeyLoaded ? '✅ Loaded' : '❌ Missing'}</div>
    <div>Root CA: ${rootCALoaded ? '✅ Loaded' : '❌ Missing'}</div>
  `);
  
  // Enable connection button only when all files are loaded
  if (connectButton) {
    if (certFileLoaded && privateKeyLoaded && rootCALoaded) {
      connectButton.removeAttribute('disabled');
      connectButton.style('background-color', '#008037');
      connectButton.style('cursor', 'pointer');
    } else {
      connectButton.attribute('disabled', '');
      connectButton.style('background-color', '#cccccc');
      connectButton.style('cursor', 'not-allowed');
    }
  }
}

function handleCertFile(file) {
  if (file.name.endsWith('.crt') || file.name.endsWith('.pem')) {
    certFile = file;
    certFileLoaded = true;
    statusMessage = "Certificate loaded: " + file.name;
    updateFileStatus();
  } else {
    statusMessage = "Invalid certificate file. Please use a .crt or .pem file.";
  }
}

function handlePrivateKeyFile(file) {
  if (file.name.endsWith('.key') || file.name.endsWith('.private.key')) {
    privateKeyFile = file;
    privateKeyLoaded = true;
    statusMessage = "Private key loaded: " + file.name;
    updateFileStatus();
  } else {
    statusMessage = "Invalid private key file. Please use a .key file.";
  }
}

function handleRootCAFile(file) {
  if (file.name.endsWith('.pem')) {
    rootCAFile = file;
    rootCALoaded = true;
    statusMessage = "Root CA loaded: " + file.name;
    updateFileStatus();
  } else {
    statusMessage = "Invalid Root CA file. Please use a .pem file.";
  }
}

async function connectToAWSIoT() {
  if (!connectButton) return; // Safety check
  
  // If already connected, disconnect first
  if (client && client.isConnected()) {
    try {
      client.disconnect();
    } catch (e) {
      console.error("Error disconnecting:", e);
    }
    connectButton.html('Connect to AWS IoT');
    connectionStatus = false;
    statusMessage = "Disconnected from AWS IoT";
    return;
  }
  
  // Get topic from input
  mqttTopic = topicInput.value();
  
  statusMessage = "Reading certificates...";
  
  try {
    // Read certificate files
    const certificate = await readFileAsync(certFile);
    const privateKey = await readFileAsync(privateKeyFile);
    const rootCA = await readFileAsync(rootCAFile);
    
    statusMessage = "Connecting to AWS IoT...";
    
    // Create AWS IoT device
    const clientId = "ball-tracker-" + Math.random().toString(16).substr(2, 8);
    
    // Configure AWS IoT MQTT Client
    const awsIotConfig = {
      protocol: 'wss',
      host: awsIotEndpoint,
      clientId: clientId,
      cert: certificate,
      key: privateKey,
      ca: rootCA,
      reconnectPeriod: 2000,
      keepalive: 10
    };
    
    // Initialize AWS IoT MQTT Client
    connectButton.html('Connecting...');
    connectButton.attribute('disabled', '');
    connectButton.style('background-color', '#cccccc');
    connectButton.style('cursor', 'not-allowed');
    
    // Create MQTT client using the AWS IoT MQTT Client library
    if (window.AWSIoTMQTT) {
      client = window.AWSIoTMQTT.connect(awsIotConfig);
      
      // Set up event handlers
      client.on('connect', function() {
        console.log('Connected to AWS IoT');
        connectionStatus = true;
        statusMessage = "Connected to AWS IoT";
        
        // Subscribe to the MQTT topic
        client.subscribe(mqttTopic);
        
        if (connectButton) {
          connectButton.html('Disconnect');
          connectButton.removeAttribute('disabled');
          connectButton.style('background-color', '#008037');
          connectButton.style('cursor', 'pointer');
        }
      });
      
      client.on('message', function(topic, payload) {
        onMessageArrived(topic, payload);
      });
      
      client.on('error', function(err) {
        console.error('Connection error:', err);
        statusMessage = "Connection error: " + err.message;
        connectionStatus = false;
        
        if (connectButton) {
          connectButton.html('Connect to AWS IoT');
          connectButton.removeAttribute('disabled');
          connectButton.style('background-color', '#008037');
          connectButton.style('cursor', 'pointer');
        }
      });
      
      client.on('close', function() {
        console.log('Connection closed');
        statusMessage = "Connection closed";
        connectionStatus = false;
        
        if (connectButton) {
          connectButton.html('Connect to AWS IoT');
          connectButton.removeAttribute('disabled');
          connectButton.style('background-color', '#008037');
          connectButton.style('cursor', 'pointer');
        }
      });
    } else {
      throw new Error("AWS IoT MQTT client library not loaded");
    }
    
  } catch (error) {
    console.error('Failed to connect:', error);
    statusMessage = "Failed to connect: " + error.message;
    
    if (connectButton) {
      connectButton.html('Connect to AWS IoT');
      connectButton.removeAttribute('disabled');
      connectButton.style('background-color', '#008037');
      connectButton.style('cursor', 'pointer');
    }
  }
}

// Helper function to read file contents
function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Called when a message arrives
function onMessageArrived(topic, payload) {
  try {
    // Convert payload to string if it's not already
    const payloadStr = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    lastReceivedMessage = payloadStr;
    
    // Parse the JSON message
    const data = JSON.parse(payloadStr);
    
    // Update ball position
    updateBallPosition(data);
    
    // Update last message time
    lastMessageTime = millis();
  } catch (error) {
    console.error("Error parsing message:", error);
    statusMessage = "Error parsing message: " + error.message;
  }
}

// Update ball position based on received coordinates
function updateBallPosition(data) {
  if (data.X !== undefined && data.Y !== undefined) {
    // Scale coordinates to our canvas size
    const scaleX = appWidth / 102;
    const scaleY = appHeight / 64;
    
    ballX = data.X * scaleX;
    ballY = data.Y * scaleY;
    
    // Log received coordinates
    console.log(`Received ball position: (${data.X}, ${data.Y}), Scaled: (${ballX}, ${ballY})`);
  }
}

function draw() {
  // Draw field image
  image(fieldImage, 0, 0, appWidth, appHeight);
  
  // Draw the ball
  image(ballImage, ballX - ballSize/2, ballY - ballSize/2, ballSize, ballSize);
  
  // Display connection status
  displayStatus();
  
  // Display last received message
  displayLastMessage();
  
  // Check for stale data
  checkDataFreshness();
}

function displayStatus() {
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(10, appHeight - 70, 400, 60, 5);
  
  textSize(16);
  fill(255);
  textAlign(LEFT, TOP);
  text("Status: " + statusMessage, 20, appHeight - 60);
  
  // Connection indicator
  fill(connectionStatus ? color(0, 255, 0) : color(255, 0, 0));
  ellipse(380, appHeight - 40, 20, 20);
  pop();
}

function displayLastMessage() {
  if (!lastReceivedMessage) return;
  
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(appWidth - 410, appHeight - 70, 400, 60, 5);
  
  textSize(14);
  fill(255);
  textAlign(LEFT, TOP);
  text("Last message: " + lastReceivedMessage.substring(0, 50) + 
       (lastReceivedMessage.length > 50 ? "..." : ""), 
       appWidth - 400, appHeight - 60);
  pop();
}

function checkDataFreshness() {
  // Check if data is stale (no message for more than 3 seconds)
  if (lastMessageTime > 0 && millis() - lastMessageTime > 3000) {
    push();
    fill(255, 0, 0, 200);
    noStroke();
    rect(appWidth/2 - 150, 10, 300, 40, 5);
    
    textSize(18);
    fill(255);
    textAlign(CENTER, CENTER);
    text("No data received for " + 
         Math.floor((millis() - lastMessageTime) / 1000) + " seconds", 
         appWidth/2, 30);
    pop();
  }
}

function keyPressed() {
  // Toggle connection with 'c' key
  if (key === 'c' || key === 'C') {
    if (certFileLoaded && privateKeyLoaded && rootCALoaded) {
      connectToAWSIoT();
    } else {
      statusMessage = "Please load all certificate files first";
    }
  }
}