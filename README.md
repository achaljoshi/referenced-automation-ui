# Referenced Automation UI Framework

Enterprise-grade reference UI automation framework - **Selenium 4 + Cucumber 7 + Java 17 + Maven**.

It is built to be **imported as a Maven dependency**, exactly like any other library in your Nexus repository. Add the coordinates below to a project's `pom.xml`, and every class in this framework - driver management, base page objects, config, logging, reporting, retry - becomes usable in that project, the same way adding `selenium-java` gives you `WebDriver`.

```xml
<dependency>
    <groupId>com.company.automation</groupId>
    <artifactId>referenced-automation-ui</artifactId>
    <version>1.0.0</version>
</dependency>
```

---

## Table of contents

- [Why this repo is structured as a library](#why-this-repo-is-structured-as-a-library)
- [What's included](#whats-included)
- [Project layout](#project-layout)
- [Quick start (working in this repo)](#quick-start-working-in-this-repo)
- [Using this as a dependency in another project](#using-this-as-a-dependency-in-another-project)
- [Configuration](#configuration)
- [Reporting](#reporting)
- [Logging](#logging)
- [Retry logic](#retry-logic)
- [Parallel execution](#parallel-execution)
- [CI/CD](#cicd)
- [Publishing to Nexus](#publishing-to-nexus)
- [IntelliJ IDEA setup](#intellij-idea-setup)
- [Extending the framework](#extending-the-framework)

---

## Why this repo is structured as a library

`src/main/java` contains only framework code - driver lifecycle, base page object, config reader, logging, reporting glue, reusable Cucumber hooks. This is what gets compiled into `referenced-automation-ui-<version>.jar` and published to Nexus. **Nothing here is project-specific.**

`src/test/java` and `src/test/resources` are a small, self-contained sample suite (`login.feature` against the public `saucedemo.com` demo site) that exercises every framework feature end-to-end. It exists to prove the framework works and to give consuming teams a working example to copy - it is **not** shipped in the published jar (Maven never publishes `src/test`), so importing this dependency does not pull in this repo's sample tests, pages, or feature files.

## What's included

| Capability | How |
|---|---|
| Import as a dependency | Plain `jar` packaging, published to Nexus via `mvn deploy` |
| Multi-browser driver management | `DriverFactory` + WebDriverManager (Chrome/Firefox/Edge, local or remote Grid, headless) - **zero manual driver binary setup** |
| Thread-safe parallel execution | `DriverManager` (`ThreadLocal<WebDriver>`) + Cucumber's JUnit-Platform parallel engine |
| Page Object base class | `BasePage` (fluent waits, logging, no raw `Thread.sleep`) |
| Config management | `ConfigReader` - env-specific properties files, overridable by `-D` system properties or OS env vars, no code changes needed per environment |
| Reporting - Extent | `tech.grasshopper:extentreports-cucumber7-adapter` (Spark HTML report with embedded failure screenshots) |
| Reporting - Allure | `allure-cucumber7-jvm` (CI dashboards, history/trends) |
| Console/CI step logging | `StepLoggerPlugin` + Log4j2 (console + `logs/automation.log`) - every step's start/pass/fail is visible live, locally and in CI job logs |
| Retry logic | Cucumber rerun-file pattern, wired into both CI pipelines and `scripts/retry-failed.sh` for local use |
| Reusable Cucumber hooks | `Hooks` (driver create/quit + failure screenshot attach) - ships in the jar, just add it to your `glue` path |
| CI/CD | `.gitlab-ci.yml` **and** `.github/workflows/ci.yml` (build/test/report/deploy) |
| IntelliJ zero-config | `.idea/` checked in: prompts to install the Cucumber+Gherkin plugins, ships working run configurations |
| No local Maven install needed | Maven Wrapper (`./mvnw`) |

## Project layout

```
referenced-automation-ui/
├── pom.xml                          # single source of truth for every dependency/plugin version
├── mvnw, mvnw.cmd, .mvn/             # Maven Wrapper - no local Maven install required
├── .gitlab-ci.yml                   # GitLab pipeline: build -> test -> report -> deploy
├── .github/workflows/ci.yml         # GitHub Actions mirror of the same pipeline
├── .idea/                           # shared IntelliJ project config (see below)
├── settings.xml.sample              # template for local Nexus publish credentials
├── scripts/retry-failed.sh          # reproduce the CI retry step locally
│
├── src/main/java/com/company/automation/     <-- SHIPPED IN THE JAR
│   ├── config/ConfigReader.java
│   ├── driver/{BrowserType,DriverFactory,DriverManager}.java
│   ├── base/BasePage.java
│   ├── utils/{WaitUtils,ScreenshotUtils}.java
│   ├── reporting/StepLoggerPlugin.java
│   ├── hooks/Hooks.java
│   └── exceptions/FrameworkException.java
├── src/main/resources/
│   ├── config/config*.properties     # default + per-env config, overridable by consumers
│   ├── log4j2.xml                    # default logging config, overridable by consumers
│   ├── extent.properties, extent-spark-config.xml, allure.properties
│
└── src/test/                          <-- NOT SHIPPED, sample/demo only
    ├── java/com/company/automation/{pages,stepdefinitions,runners}/...
    └── resources/{features/login.feature, junit-platform.properties}
```

## Quick start (working in this repo)

```bash
git clone https://github.com/achaljoshi/referenced-automation-ui.git
cd referenced-automation-ui

./mvnw clean test                       # headless Chrome, env=qa, by default
./mvnw clean test -Dbrowser=firefox -Dheadless=false -Denv=qa
./mvnw -Dtest=RunSmokeTest test          # only @smoke-tagged scenarios
./scripts/retry-failed.sh                # run, and retry only what failed (mirrors CI)
```

Reports land under `target/`:

- `target/extent-report/ExtentSparkReport.html` - open directly in a browser
- `target/allure-results/` - run `allure serve target/allure-results` (requires the [Allure commandline](https://allurereport.org/docs/install/) tool) for the interactive dashboard
- `target/cucumber-reports/{cucumber.json,cucumber.xml,rerun.txt}`
- `logs/automation.log` - full step-by-step run log
- `target/screenshots/` - one PNG per failed scenario

## Using this as a dependency in another project

1. **Add the dependency** (once published - see [Publishing to Nexus](#publishing-to-nexus)):

   ```xml
   <dependency>
       <groupId>com.company.automation</groupId>
       <artifactId>referenced-automation-ui</artifactId>
       <version>1.0.0</version>
   </dependency>
   ```

2. **Write your own page objects**, extending the framework's `BasePage`:

   ```java
   import com.company.automation.base.BasePage;

   public class CheckoutPage extends BasePage {
       public CheckoutPage(WebDriver driver) { super(driver); }
       // use protected click(By)/type(By,String)/textOf(By)/isDisplayed(By)
   }
   ```

3. **Write your own step definitions**, getting the WebDriver from `DriverManager`:

   ```java
   import com.company.automation.driver.DriverManager;

   public class CheckoutSteps {
       @When("I proceed to checkout")
       public void checkout() {
           new CheckoutPage(DriverManager.getDriver()).proceed();
       }
   }
   ```

4. **Point your Cucumber glue path at both packages** - your own step definitions *and* this framework's hooks, so driver lifecycle + reporting + screenshots keep working automatically:

   ```properties
   # your project's junit-platform.properties
   cucumber.glue=com.company.automation.hooks,com.yourcompany.yourproject.stepdefinitions
   cucumber.plugin=pretty, \
     com.company.automation.reporting.StepLoggerPlugin, \
     com.aventstack.extentreports.cucumber.adapter.ExtentCucumberAdapter:, \
     io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm
   ```

5. **Override any config** by dropping your own `config/config-<env>.properties`, `log4j2.xml`, `extent.properties`, etc. in *your* project's `src/test/resources` - classpath resources in your own module take precedence over the same-named defaults shipped in the framework jar.

## Configuration

All configuration goes through `com.company.automation.config.ConfigReader`. Resolution order (highest wins):

1. `-Dkey=value` JVM system property
2. OS environment variable (`base.url` → `BASE_URL`)
3. `config/config-<env>.properties` (`-Denv=qa`, default `qa`)
4. `config/config.properties` (framework defaults)

| Key | Default | Meaning |
|---|---|---|
| `browser` | `chrome` | `chrome` \| `firefox` \| `edge` |
| `headless` | `true` | run headless |
| `grid.url` | *(empty)* | set to run against a remote Selenium Grid/cloud instead of locally |
| `env` | `qa` | selects `config-<env>.properties` |
| `base.url` | *(per env)* | application under test |
| `implicit.wait.seconds` / `explicit.wait.seconds` / `pageload.timeout.seconds` | `5` / `15` / `30` | Selenium timeouts |

## Reporting

Two reports are generated on every run, side by side, from the same Cucumber execution - no test code changes needed to get either one:

- **Extent (`tech.grasshopper:extentreports-cucumber7-adapter`)** - rich local HTML (`target/extent-report/ExtentSparkReport.html`), with failure screenshots embedded automatically.
- **Allure (`allure-cucumber7-jvm`)** - `target/allure-results/`, meant for CI dashboards with history and trend graphs (`allure serve` locally, or published to GitLab Pages / GitHub Pages by the CI pipelines in this repo).

Both are driven by the same `Scenario.attach(...)` call in `Hooks.tearDown` - a screenshot taken on failure is attached once and shows up in both reports and in the plain Cucumber JSON/XML output.

## Logging

`StepLoggerPlugin` (a Cucumber `ConcurrentEventListener`) logs every scenario start/end and every step's start, pass/fail and duration through SLF4J → Log4j2, which writes to **both** the console (visible locally and in raw CI job logs) and `logs/automation.log` (archived as a CI artifact). Framework internals (`com.company.automation.*`) log at `INFO`; noisy third-party libraries (Selenium, WebDriverManager, Apache HTTP client) are dialed down to `WARN`/`INFO` in `log4j2.xml`.

## Retry logic

`cucumber-junit-platform-engine` has **no built-in "retry N times" property** (there is no `cucumber.execution.retry.count` - only `cucumber.execution.*` for parallelism, ordering and filtering). The framework uses the standard Cucumber **rerun-file** pattern instead:

1. Every run writes failed scenarios to `target/cucumber-reports/rerun.txt` (the `rerun:` plugin).
2. If that file is non-empty, re-run **only those scenarios**:
   ```bash
   mvn test -Dcucumber.features=@target/cucumber-reports/rerun.txt
   ```
   (`cucumber.features` overrides the runner's `@SelectClasspathResource("features")` annotation.)
3. The pipeline only fails if scenarios are still in `rerun.txt` after the retry.

This is implemented identically in `.gitlab-ci.yml`, `.github/workflows/ci.yml`, and `scripts/retry-failed.sh` for local use - one behaviour, three entry points.

## Parallel execution

Enabled by default in `junit-platform.properties`:

```properties
cucumber.execution.parallel.enabled=true
cucumber.execution.parallel.config.strategy=fixed
cucumber.execution.parallel.config.fixed.parallelism=2
```

Safe because `DriverManager` binds one `WebDriver` per thread (`ThreadLocal`). Raise `fixed.parallelism` to match how many concurrent browser sessions your CI runner or Grid can sustain.

## CI/CD

Both pipelines run the same four stages and are kept in lockstep:

| Stage | GitLab (`.gitlab-ci.yml`) | GitHub Actions (`.github/workflows/ci.yml`) |
|---|---|---|
| Build | `build` job | `build` job |
| Test | `test` job - apt-installs `chromium`/`chromium-driver` and pins `-Dwebdriver.chrome.driver` for a deterministic browser/driver pairing, retries failed scenarios once, gates the pipeline on the final result | `test` job - relies on the Chrome already preinstalled on `ubuntu-latest` and lets WebDriverManager auto-resolve a matching driver (the "zero setup" path), same retry/gate logic |
| Report | `pages` job publishes an Allure HTML report to GitLab Pages (main branch only) | `publish-allure-report` job publishes the same to GitHub Pages; JUnit results are also annotated on the PR via `mikepenz/action-junit-report` |
| Deploy | `deploy` job - `mvn deploy` to Nexus on `main`/tags, credentials from `NEXUS_USER`/`NEXUS_PASS` CI/CD variables | `deploy` job - identical, from repository secrets |

Cucumber/Extent/Allure/log artifacts are uploaded with `when: always` / `if: always()` so they are available even when the test stage fails.

## Publishing to Nexus

`pom.xml` already declares `distributionManagement` for both a release and a snapshot Nexus repository, resolved from environment variables so no URL is hard-coded:

```bash
export NEXUS_RELEASE_URL="https://nexus.yourcompany.com/repository/maven-releases/"
export NEXUS_SNAPSHOT_URL="https://nexus.yourcompany.com/repository/maven-snapshots/"
./mvnw -s settings.xml deploy      # -s settings.xml supplies credentials, see settings.xml.sample
```

Locally: copy `settings.xml.sample` to `~/.m2/settings.xml` and fill in real credentials (never commit a filled-in copy - `settings.xml` is gitignored). In CI, both pipelines generate an equivalent `settings.xml` on the fly from protected secret variables - see the `deploy` jobs.

## IntelliJ IDEA setup

Just **open the project** - `.idea/` is checked in on purpose:

- `.idea/externalDependencies.xml` prompts you to install/enable the **Cucumber for Java** and **Gherkin** plugins the first time the project opens (both ship with IntelliJ **Ultimate**; Community Edition has no Cucumber/Gherkin support at all).
- `.idea/runConfigurations/` ships three ready-to-run configurations: *Regression (RunCucumberTest)*, *Smoke (RunSmokeTest)*, and *Maven: clean test*.
- `.idea/misc.xml` pins the project SDK to Java 17.
- No manual "mark directory as..." or SDK setup should be needed.

## Extending the framework

- **New browser**: add a case to `BrowserType` and to `DriverFactory`'s switch statements.
- **New environment**: drop a `config/config-<env>.properties` on the classpath (framework or consumer), then run with `-Denv=<name>`.
- **Custom retry behaviour**: everything routes through the `rerun:` Cucumber plugin and `cucumber.features=@<file>` - swap `scripts/retry-failed.sh` or the CI retry step for a loop if you need more than one retry attempt.
- **Version bumps**: every dependency/plugin version is a single property at the top of `pom.xml`. Run `./mvnw versions:display-dependency-updates` (via the `versions-maven-plugin`, already wired in) to check for newer releases before bumping.
