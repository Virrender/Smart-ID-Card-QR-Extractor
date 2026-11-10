pipeline {
    agent any

    environment {
        DOCKER_USER = 'xvirenverse'
        IMAGE_NAME  = 'carta-backend'
        EC2_IP      = '16.178.173.3'
        EC2_USER    = 'ubuntu'
    }

    stages {
        // Stage 1: Checkout the code from GitHub
        stage('Checkout Code') {
            steps {
                echo 'Checking out latest code from GitHub...'
                checkout scm
            }
        }

        // Stage 2: Build the Docker Image
        stage('Build Docker Image') {
            steps {
                echo "Building Docker image ${DOCKER_USER}/${IMAGE_NAME}:latest..."
                sh "docker build -t ${DOCKER_USER}/${IMAGE_NAME}:latest ./backend"
            }
        }

        // Stage 3: Push the Docker Image to Docker Hub
        stage('Push to Docker Hub') {
            steps {
                echo 'Authenticating with Docker Hub and pushing image...'
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_ID', passwordVariable: 'DOCKER_PWD')]) {
                    sh 'echo $DOCKER_PWD | docker login -u $DOCKER_ID --password-stdin'
                    sh "docker push ${DOCKER_USER}/${IMAGE_NAME}:latest"
                }
            }
        }

        // Stage 4: Deploy to live AWS EC2 Backend Server
        stage('Deploy to AWS EC2') {
            steps {
                echo "Connecting to AWS EC2 (${EC2_IP}) via SSH and updating container..."
                withCredentials([file(credentialsId: 'ec2-key', variable: 'KEY_FILE')]) {
                    sh """
                    chmod 400 \${KEY_FILE}
                    ssh -o StrictHostKeyChecking=no -i \${KEY_FILE} ${EC2_USER}@${EC2_IP} "
                        sudo docker pull ${DOCKER_USER}/${IMAGE_NAME}:latest
                        sudo docker stop carta-api || true
                        sudo docker rm carta-api || true
                        sudo docker run -d -p 80:8000 -p 8000:8000 --name carta-api --restart always ${DOCKER_USER}/${IMAGE_NAME}:latest
                    "
                    """
                }
            }
        }
    }

    post {
        success {
            echo "=========================================================="
            echo "🎉 CI/CD Pipeline Succeeded!"
            echo "Live server is updated and running at http://${EC2_IP}/health"
            echo "=========================================================="
        }
        failure {
            echo "=========================================================="
            echo "❌ CI/CD Pipeline Failed! Please check the logs above."
            echo "=========================================================="
        }
    }
}
