@jira-KAN-6 @generated
Feature: User login
  As a registered user
  I want to log into the application
  So that I can access my dashboard

  Scenario: Login with valid credentials
    Given I am on the login page
    When I enter valid email and password
    Then I am redirected to the dashboard

  Scenario: Login with invalid credentials
    Given I am on the login page
    When I enter invalid email and password
    Then I see an error message
    And I remain on the login page